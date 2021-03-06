import GameState from "../../../GameState";
import ActionGameState from "../ActionGameState";
import {ClientMessage} from "../../../../messages/ClientMessage";
import Player from "../../Player";
import {ServerMessage} from "../../../../messages/ServerMessage";
import Game from "../../game-data-structure/Game";
import House from "../../game-data-structure/House";
import EntireGame from "../../../EntireGame";
import {land, port, sea} from "../../game-data-structure/regionTypes";
import PlayerMusteringGameState, {
    PlayerMusteringType,
    SerializedPlayerMusteringGameState
} from "../../westeros-game-state/mustering-game-state/player-mustering-game-state/PlayerMusteringGameState";
import Region from "../../game-data-structure/Region";
import IngameGameState from "../../IngameGameState";
import _ from "lodash";
import IronBankOrderType from "../../game-data-structure/order-types/IronBankOrderType";

export default class ResolveConsolidatePowerGameState extends GameState<ActionGameState, PlayerMusteringGameState> {
    get game(): Game {
        return this.actionGameState.game;
    }

    get entireGame(): EntireGame {
        return this.actionGameState.entireGame;
    }

    get actionGameState(): ActionGameState {
        return this.parentGameState;
    }

    get ingame(): IngameGameState {
        return this.actionGameState.ingameGameState;
    }

    firstStart(): void {
        this.ingame.log({
            type: "action-phase-resolve-consolidate-power-began"
        });
        this.proceedNextResolve(null);
    }

    getPotentialGainedPowerTokens(region: Region, house: House): number {
        const order = this.actionGameState.ordersOnBoard.tryGet(region, null);
        if (order && order.type instanceof IronBankOrderType) {
            // Iron Bank orders can't be used for Consolidating Power
            return 0;
        }

        if (region.type == sea) {
            // A consolidate power on sea grants nothing.
            // Do nothing.
        } else if (region.type == port) {
            // A single power token is granted if the adjacent sea is unoccupied
            // or if it belongs to the same house than the port
            const adjacentSea = this.game.world.getAdjacentSeaOfPort(region);
            const adjacentSeaController = adjacentSea.getController();
            if (adjacentSeaController == null || adjacentSeaController == house) {
                return 1;
            }
        } else if (region.type == land) {
            return 1 + region.crownIcons;
        }

        return 0;
    }

    resolveConsolidatePowerOrderForPt(region: Region, house: House): void {
        let gains: number = this.getPotentialGainedPowerTokens(region, house);

        if(gains > 0) {
            gains = this.ingame.changePowerTokens(house, gains);
        }

        this.ingame.log({
            type: "consolidate-power-order-resolved",
            house: house.id,
            region: region.id,
            starred: this.actionGameState.ordersOnBoard.get(region).type.starred,
            powerTokenCount: gains
        });
    }

    proceedNextResolve(lastHouseToResolve: House | null): void {
        const nextToResolve = this.getNextHouseToResolveOrder(lastHouseToResolve);

        if (!nextToResolve) {
            this.actionGameState.onResolveConsolidatePowerEnd();
            return;
        }

        const consolidatePowerOrders = this.actionGameState.getRegionsWithConsolidatePowerOrderOfHouse(nextToResolve);

        if (consolidatePowerOrders.length == 0 && this.ingame.isVassalHouse(nextToResolve)) {
            const regions = this.actionGameState.getRegionsWithDefenseMusterOrderOfHouse(nextToResolve);
            if (regions.length > 0) {
                this.setChildGameState(new PlayerMusteringGameState(this)).firstStart(nextToResolve, PlayerMusteringType.DEFENSE_MUSTER_ORDER);
            } else {
                // Proceed to the next house
                this.proceedNextResolve(nextToResolve);
            }

            return;
        }

        // Before asking the player to resolve a Consolidate Power token,
        // check if they only have non-starred Consolidate Power tokens, or
        // if the starred ones are present on regions with no structure.
        // In that case, fast-track the process and simply resolve one of those.

        if (consolidatePowerOrders.length == 0) {
            // This should never happen but for safety we check again
            // If it really happens we proceed with the next house
            this.proceedNextResolve(nextToResolve);
            return;
        }

        if (consolidatePowerOrders.every(([r, ot]) => !ot.starred || (ot.starred && !r.hasStructure))) {
            // Take one of the CP order and resolve it
            const [region] = consolidatePowerOrders[0];

            this.resolveConsolidatePowerOrderForPt(region, nextToResolve);

            // Remove the order from the board
            this.actionGameState.removeOrderFromRegion(region);

            // Proceed to the next house
            this.proceedNextResolve(nextToResolve);
        } else {
            this.setChildGameState(new PlayerMusteringGameState(this)).firstStart(nextToResolve, PlayerMusteringType.STARRED_CONSOLIDATE_POWER);
        }
    }

    onPlayerMusteringEnd(house: House, regions: Region[]): void {
        const region = regions[0];

        if (!region) {
            throw new Error();
        }

        // Remove ConsolidatePower/IronBank/Muster order token
        this.actionGameState.removeOrderFromRegion(region);
        this.proceedNextResolve(house);
    }

    getNextHouseToResolveOrder(lastHouseToResolve: House | null): House | null {
        let currentHouseToCheck = lastHouseToResolve ? this.ingame.getNextInTurnOrder(lastHouseToResolve) : this.game.getTurnOrder()[0];

        // Check each house in order to find one that has a consolidate power
        for (let i = 0;i < this.game.houses.size;i++) {
            const regions = _.concat(
                    this.actionGameState.getRegionsWithConsolidatePowerOrderOfHouse(currentHouseToCheck).map(([r, _ot]) => r),
                    this.actionGameState.getRegionsWithDefenseMusterOrderOfHouse(currentHouseToCheck));

            if (regions.length > 0) {
                return currentHouseToCheck;
            }

            currentHouseToCheck = this.ingame.getNextInTurnOrder(currentHouseToCheck);
        }

        // If no house has any CP* order available, return null
        return null;
    }

    onPlayerMessage(player: Player, message: ClientMessage): void {
        this.childGameState.onPlayerMessage(player, message);
    }

    onServerMessage(message: ServerMessage): void {
        this.childGameState.onServerMessage(message);
    }

    serializeToClient(admin: boolean, player: Player | null): SerializedResolveConsolidatePowerGameState {
        return {
            type: "resolve-consolidate-power",
            childGameState: this.childGameState.serializeToClient(admin, player)
        };
    }

    static deserializeFromServer(action: ActionGameState, data: SerializedResolveConsolidatePowerGameState): ResolveConsolidatePowerGameState {
        const resolveConsolidatePower = new ResolveConsolidatePowerGameState(action);

        resolveConsolidatePower.childGameState = resolveConsolidatePower.deserializeChildGameState(data.childGameState);

        return resolveConsolidatePower;
    }

    deserializeChildGameState(data: SerializedResolveConsolidatePowerGameState["childGameState"]): PlayerMusteringGameState {
        return PlayerMusteringGameState.deserializeFromServer(this, data);
    }
}

export interface SerializedResolveConsolidatePowerGameState {
    type: "resolve-consolidate-power";
    childGameState: SerializedPlayerMusteringGameState;
}
