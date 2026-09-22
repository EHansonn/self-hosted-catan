import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOM_CODE_INPUT_PATTERN,
  ROOM_CODE_PATTERN,
} from "../shared/room-code";

test("new six-character codes and existing sixteen-character invites are valid", () => {
  const browserPattern = new RegExp(`^${ROOM_CODE_INPUT_PATTERN}$`);
  for (const code of ["ABC123", "000000", "Z9Y8X7", "0123456789ABCDEF"])
    assert.ok(ROOM_CODE_PATTERN.test(code) && browserPattern.test(code));
  for (const code of ["ABC12", "ABC1234", "abc123", "G123456789ABCDEF", "0123456789ABCDE"])
    assert.ok(!ROOM_CODE_PATTERN.test(code) && !browserPattern.test(code));
});
