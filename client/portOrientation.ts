export interface BoardPoint {
  x: number;
  y: number;
}

export interface HarborTransform {
  centerX: number;
  centerZ: number;
  outwardX: number;
  outwardZ: number;
  rotationY: number;
}

export function harborTransformForEdge(
  a: BoardPoint,
  b: BoardPoint,
  boardCenter: BoardPoint = { x: 0, y: 0 },
): HarborTransform {
  const centerX = (a.x + b.x) / 2;
  const centerZ = (a.y + b.y) / 2;
  const edgeX = b.x - a.x;
  const edgeZ = b.y - a.y;
  const edgeLength = Math.hypot(edgeX, edgeZ) || 1;
  let outwardX = -edgeZ / edgeLength;
  let outwardZ = edgeX / edgeLength;
  const fromBoardX = centerX - boardCenter.x;
  const fromBoardZ = centerZ - boardCenter.y;

  if (outwardX * fromBoardX + outwardZ * fromBoardZ < 0) {
    outwardX *= -1;
    outwardZ *= -1;
  }

  return {
    centerX,
    centerZ,
    outwardX,
    outwardZ,
    rotationY: Math.atan2(outwardX, outwardZ),
  };
}
