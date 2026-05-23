import { randomBytes } from "node:crypto";

function randomHex(byteLength = 16): string {
  return randomBytes(byteLength).toString("hex");
}

export function newPageContextId(): string {
  return `pc_${randomHex()}`;
}

export function newSelectionContextId(): string {
  return `sel_${randomHex()}`;
}
