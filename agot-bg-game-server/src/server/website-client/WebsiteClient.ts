import User from "../User";

export interface StoredGameData {
    id: string;
    name: string;
    ownerId: string;
    serializedGame: object | null;
    version: string | null;
}

export interface StoredUserData {
    id: string;
    name: string;
    token: string;
}

export default interface WebsiteClient {
    getUser(userId: string): Promise<StoredUserData | null>;
    getGame(gameId: string): Promise<StoredGameData | null>;
    saveGame(gameId: string, serializedGame: object, viewOfGame: object, players: {userId: string; data: object}[], state: string, version: string): Promise<void>;
    notifyReadyToStart(gameId: string, userIds: string[]): Promise<void>;
    notifyYourTurn(gameId: string, userIds: string[]): Promise<void>;
    notifyBattleResults(gameId: string, userIds: string[]): Promise<void>;
    notifyNewVote(gameId: string, userIds: string[]): Promise<void>;
    notifyGameEnded(gameId: string, userIds: string[]): Promise<void>;
    createPublicChatRoom(name: string): Promise<string>;
    createPrivateChatRoom(users: User[], name: string): Promise<string>;
}
