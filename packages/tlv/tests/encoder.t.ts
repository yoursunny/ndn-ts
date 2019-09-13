import { Encoder } from "../src";
import "../src/expect";

test("prepend and extend", () => {
  const encoder = new Encoder(7);
  let output = encoder.output;
  expect(output).toBeInstanceOf(Uint8Array);
  expect(output).toHaveLength(0);
  expect(output.byteOffset).toBe(7);
  expect(output.byteLength).toBe(0);

  let room = encoder.prepend(4);
  expect(room).toBeInstanceOf(Buffer);
  expect(room).toHaveLength(4);
  room.writeUInt32BE(0xA0A1A2A3, 0);

  output = encoder.output;
  expect(output).toHaveLength(4);
  expect(output.byteOffset).toBe(3);
  expect(output.byteLength).toBe(4);
  expect(output).toEqualUint8Array([0xA0, 0xA1, 0xA2, 0xA3]);

  room = encoder.prepend(5);
  expect(room).toHaveLength(5);
  room.writeUInt32BE(0xB0B1B2B3, 1);
  room[0] = 0xC0;

  output = encoder.output;
  expect(output).toHaveLength(9);
  expect(output.byteOffset).toBeGreaterThan(1024);
  expect(output.byteLength).toBe(9);
  expect(output).toEqualUint8Array([0xC0, 0xB0, 0xB1, 0xB2, 0xB3, 0xA0, 0xA1, 0xA2, 0xA3]);
});

test("TLV", () => {
  const encoder = new Encoder(5);

  encoder.beginValue();
  {
    encoder.beginValue();
    encoder.prepend(2).writeUInt16BE(0xA0A1, 0);
    encoder.endValue(0x01);

    encoder.beginValue();
    encoder.prepend(2).writeUInt16BE(0xB0B1, 0);
    encoder.endValue(0x100);
  }
  encoder.endValue(0x10000);

  expect(encoder).toEncodeAs([
    0xFE, 0x00, 0x01, 0x00, 0x00, 0x0A,
    0xFD, 0x01, 0x00, 0x02, 0xB0, 0xB1,
    0x01, 0x02, 0xA0, 0xA1,
  ]);
});

test("error on VAR-NUMBER-9", () => {
  const encoder = new Encoder();
  expect(() => { encoder.prependTypeLength(0x01, 0x100000000); }).toThrow();
});

test("error on beginValue-endValue mismatch", () => {
  const encoder = new Encoder();
  encoder.beginValue();
  {
    encoder.beginValue();
    encoder.endValue(0xF0);
  }
  encoder.endValue(0xF1);
  expect(() => { encoder.endValue(0xF2); }).toThrow();
});
