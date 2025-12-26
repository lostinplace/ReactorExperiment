class GameConfig {
    public readonly mapRadius: number;

    public readonly mineCount: number;

    public readonly exponentBase: number;

    public readonly seed: string;

    constructor(
        mapRadius: number,
        mineCount: number,
        exponentBase: number,
        seed: string
    ) {
        this.seed = seed;
        this.exponentBase = exponentBase;
        this.mineCount = mineCount;
        this.mapRadius = mapRadius;
    }
}

export default GameConfig
