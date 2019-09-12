import { Tlv } from "../src";

test("simple", () => {
  let tlv = new Tlv();
  expect(tlv.type).toBe(0);
  expect(tlv.length).toBe(0);
  expect(tlv.value).toEqual(new Uint8Array());

  tlv = new Tlv(0x01);
  expect(tlv.type).toBe(0x01);
  expect(tlv.length).toBe(0);
  expect(tlv.value).toEqual(new Uint8Array());

  tlv = new Tlv(new Uint8Array([0x02, 0x00]))
  expect(tlv.type).toBe(0x02);
  expect(tlv.length).toBe(0);
  expect(tlv.value).toEqual(new Uint8Array());

  tlv = new Tlv(0x03, new Uint8Array([0xA0, 0xA1, 0xA2]))
  expect(tlv.type).toBe(0x03);
  expect(tlv.length).toBe(3);
  expect(tlv.value).toEqual(new Uint8Array([0xA0, 0xA1, 0xA2]));
});
