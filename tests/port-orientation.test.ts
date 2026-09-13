import assert from "node:assert/strict";
import test from "node:test";
import {
  harborLabelPosition,
  harborTransformForEdge,
} from "../client/portOrientation";

const closeTo = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("angled harbors face squarely away from their coast edge", () => {
  const a = { x: 2, y: 1 };
  const b = { x: 3, y: 2 };
  const transform = harborTransformForEdge(a, b);
  const edgeX = b.x - a.x;
  const edgeZ = b.y - a.y;

  closeTo(transform.outwardX * edgeX + transform.outwardZ * edgeZ, 0);
  assert.ok(
    transform.outwardX * transform.centerX +
      transform.outwardZ * transform.centerZ >
      0,
  );
  closeTo(Math.sin(transform.rotationY), transform.outwardX);
  closeTo(Math.cos(transform.rotationY), transform.outwardZ);
});

test("harbor orientation is stable when an edge's vertices are reversed", () => {
  const a = { x: -3, y: 1 };
  const b = { x: -2, y: 2 };
  const forward = harborTransformForEdge(a, b);
  const reverse = harborTransformForEdge(b, a);

  closeTo(forward.centerX, reverse.centerX);
  closeTo(forward.centerZ, reverse.centerZ);
  closeTo(forward.outwardX, reverse.outwardX);
  closeTo(forward.outwardZ, reverse.outwardZ);
  closeTo(forward.rotationY, reverse.rotationY);
});

test("harbor labels sit outward from the coast without inheriting dock rotation", () => {
  const transform = harborTransformForEdge(
    { x: 2, y: 1 },
    { x: 3, y: 2 },
  );
  const label = harborLabelPosition(transform, 0.52);

  closeTo(label.x - transform.centerX, transform.outwardX * 0.52);
  closeTo(label.z - transform.centerZ, transform.outwardZ * 0.52);
});
