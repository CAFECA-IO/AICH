export interface IBlockData {
  blockText: string | undefined;
  blockVertices:
    | {
        x: number | null | undefined;
        y: number | null | undefined;
      }[]
    | undefined;
}
