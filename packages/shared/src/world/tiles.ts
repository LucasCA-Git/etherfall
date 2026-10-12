/** Terrain tile types. Values are uploaded to the GPU as-is (R channel of the tile texture). */
export enum Tile {
  Grass = 0,
  TallGrass = 1,
  Dirt = 2,
  Sand = 3,
  ShallowWater = 4,
  DeepWater = 5,
  Rock = 6,
  RuinFloor = 7,
  CastleFloor = 8,
  DungeonFloor = 9,
}

export interface TileProps {
  walkable: boolean;
  /** Movement speed multiplier. */
  speed: number;
}

export const TILE_PROPS: Record<Tile, TileProps> = {
  [Tile.Grass]: { walkable: true, speed: 1 },
  [Tile.TallGrass]: { walkable: true, speed: 0.92 },
  [Tile.Dirt]: { walkable: true, speed: 1.05 },
  [Tile.Sand]: { walkable: true, speed: 0.9 },
  [Tile.ShallowWater]: { walkable: true, speed: 0.55 },
  [Tile.DeepWater]: { walkable: false, speed: 0 },
  [Tile.Rock]: { walkable: false, speed: 0 },
  [Tile.RuinFloor]: { walkable: true, speed: 1.05 },
  [Tile.CastleFloor]: { walkable: true, speed: 1.05 },
  [Tile.DungeonFloor]: { walkable: true, speed: 1 },
};

export const isWalkable = (t: Tile): boolean => TILE_PROPS[t]?.walkable ?? false;
