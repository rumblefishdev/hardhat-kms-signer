import BN from "bn.js";

export function toHexString(
  value: BN | Buffer | undefined
): string | undefined {
  if (value === undefined) {
    return;
  }
  return `0x${value.toString("hex")}`;
}
