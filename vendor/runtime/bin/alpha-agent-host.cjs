#!/usr/bin/env node
"use strict";

// src/provider/fixture-provider.ts
var import_promises = require("node:timers/promises");

// ../../node_modules/.pnpm/@bufbuild+protobuf@2.14.0/node_modules/@bufbuild/protobuf/dist/esm/wire/varint.js
function varint64read() {
  const buf = this.buf;
  let pos = this.pos;
  let lo = 0;
  let hi = 0;
  for (let shift = 0; shift < 28; shift += 7) {
    const b = buf[pos++];
    lo |= (b & 127) << shift;
    if ((b & 128) == 0) {
      this.pos = pos;
      this.assertBounds();
      this.varint64Lo = lo;
      this.varint64Hi = hi;
      return;
    }
  }
  const middleByte = buf[pos++];
  lo |= (middleByte & 15) << 28;
  hi = (middleByte & 112) >> 4;
  if ((middleByte & 128) == 0) {
    this.pos = pos;
    this.assertBounds();
    this.varint64Lo = lo;
    this.varint64Hi = hi;
    return;
  }
  for (let shift = 3; shift <= 31; shift += 7) {
    const b = buf[pos++];
    hi |= (b & 127) << shift;
    if ((b & 128) == 0) {
      this.pos = pos;
      this.assertBounds();
      this.varint64Lo = lo;
      this.varint64Hi = hi;
      return;
    }
  }
  throw new Error("invalid varint");
}
var TWO_PWR_32_DBL = 4294967296;
function int64FromString(dec) {
  const minus = dec[0] === "-";
  if (minus) {
    dec = dec.slice(1);
  }
  const base = 1e6;
  let lowBits = 0;
  let highBits = 0;
  function add1e6digit(begin, end) {
    const digit1e6 = Number(dec.slice(begin, end));
    highBits *= base;
    lowBits = lowBits * base + digit1e6;
    if (lowBits >= TWO_PWR_32_DBL) {
      highBits = highBits + (lowBits / TWO_PWR_32_DBL | 0);
      lowBits = lowBits % TWO_PWR_32_DBL;
    }
  }
  add1e6digit(-24, -18);
  add1e6digit(-18, -12);
  add1e6digit(-12, -6);
  add1e6digit(-6);
  return minus ? negate(lowBits, highBits) : newBits(lowBits, highBits);
}
function int64ToString(lo, hi) {
  let bits = newBits(lo, hi);
  const negative = bits.hi & 2147483648;
  if (negative) {
    bits = negate(bits.lo, bits.hi);
  }
  const result = uInt64ToString(bits.lo, bits.hi);
  return negative ? "-" + result : result;
}
function uInt64ToString(lo, hi) {
  ({ lo, hi } = toUnsigned(lo, hi));
  if (hi <= 2097151) {
    return String(TWO_PWR_32_DBL * hi + lo);
  }
  const low = lo & 16777215;
  const mid = (lo >>> 24 | hi << 8) & 16777215;
  const high = hi >> 16 & 65535;
  let digitA = low + mid * 6777216 + high * 6710656;
  let digitB = mid + high * 8147497;
  let digitC = high * 2;
  const base = 1e7;
  if (digitA >= base) {
    digitB += Math.floor(digitA / base);
    digitA %= base;
  }
  if (digitB >= base) {
    digitC += Math.floor(digitB / base);
    digitB %= base;
  }
  return digitC.toString() + decimalFrom1e7WithLeadingZeros(digitB) + decimalFrom1e7WithLeadingZeros(digitA);
}
function toUnsigned(lo, hi) {
  return { lo: lo >>> 0, hi: hi >>> 0 };
}
function newBits(lo, hi) {
  return { lo: lo | 0, hi: hi | 0 };
}
function negate(lowBits, highBits) {
  highBits = ~highBits;
  if (lowBits) {
    lowBits = ~lowBits + 1;
  } else {
    highBits += 1;
  }
  return newBits(lowBits, highBits);
}
var decimalFrom1e7WithLeadingZeros = (digit1e7) => {
  const partial = String(digit1e7);
  return "0000000".slice(partial.length) + partial;
};
function varint32read() {
  let b = this.buf[this.pos++];
  if ((b & 128) === 0) {
    this.assertBounds();
    return b;
  }
  let result = b & 127;
  b = this.buf[this.pos++];
  result |= (b & 127) << 7;
  if ((b & 128) === 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 127) << 14;
  if ((b & 128) === 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 127) << 21;
  if ((b & 128) === 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 15) << 28;
  for (let readBytes = 5; (b & 128) !== 0 && readBytes < 10; readBytes++)
    b = this.buf[this.pos++];
  if ((b & 128) !== 0)
    throw new Error("invalid varint");
  this.assertBounds();
  return result >>> 0;
}

// ../../node_modules/.pnpm/@bufbuild+protobuf@2.14.0/node_modules/@bufbuild/protobuf/dist/esm/proto-int64.js
var protoInt64 = /* @__PURE__ */ makeInt64Support();
function makeInt64Support() {
  const dv = new DataView(new ArrayBuffer(8));
  const ok = typeof BigInt === "function" && typeof dv.getBigInt64 === "function" && typeof dv.getBigUint64 === "function" && typeof dv.setBigInt64 === "function" && typeof dv.setBigUint64 === "function" && (!!globalThis.Deno || !!globalThis.Bun || typeof process != "object" || typeof process.env != "object" || process.env.BUF_BIGINT_DISABLE !== "1");
  if (ok) {
    const MIN = BigInt("-9223372036854775808");
    const MAX = BigInt("9223372036854775807");
    const UMIN = BigInt("0");
    const UMAX = BigInt("18446744073709551615");
    return {
      zero: BigInt(0),
      supported: true,
      parse(value) {
        const bi = typeof value == "bigint" ? value : BigInt(value);
        if (bi > MAX || bi < MIN) {
          throw new Error(`invalid int64: ${value}`);
        }
        return bi;
      },
      uParse(value) {
        const bi = typeof value == "bigint" ? value : BigInt(value);
        if (bi > UMAX || bi < UMIN) {
          throw new Error(`invalid uint64: ${value}`);
        }
        return bi;
      },
      enc(value) {
        dv.setBigInt64(0, this.parse(value), true);
        return {
          lo: dv.getInt32(0, true),
          hi: dv.getInt32(4, true)
        };
      },
      uEnc(value) {
        dv.setBigInt64(0, this.uParse(value), true);
        return {
          lo: dv.getInt32(0, true),
          hi: dv.getInt32(4, true)
        };
      },
      dec(lo, hi) {
        dv.setInt32(0, lo, true);
        dv.setInt32(4, hi, true);
        return dv.getBigInt64(0, true);
      },
      uDec(lo, hi) {
        dv.setInt32(0, lo, true);
        dv.setInt32(4, hi, true);
        return dv.getBigUint64(0, true);
      }
    };
  }
  return {
    zero: "0",
    supported: false,
    parse(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertInt64String(value);
      return value;
    },
    uParse(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertUInt64String(value);
      return value;
    },
    enc(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertInt64String(value);
      return int64FromString(value);
    },
    uEnc(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertUInt64String(value);
      return int64FromString(value);
    },
    dec(lo, hi) {
      return int64ToString(lo, hi);
    },
    uDec(lo, hi) {
      return uInt64ToString(lo, hi);
    }
  };
}
function assertInt64String(value) {
  if (!/^-?[0-9]+$/.test(value)) {
    throw new Error("invalid int64: " + value);
  }
}
function assertUInt64String(value) {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error("invalid uint64: " + value);
  }
}

// ../../node_modules/.pnpm/@bufbuild+protobuf@2.14.0/node_modules/@bufbuild/protobuf/dist/esm/wire/text-encoding.js
var symbol = /* @__PURE__ */ Symbol.for("@bufbuild/protobuf/text-encoding");
function configureTextEncoding(textEncoding) {
  var _a;
  globalThis[symbol] = Object.assign(Object.assign({}, textEncoding), { encodeUtf8Into: (_a = textEncoding.encodeUtf8Into) !== null && _a !== void 0 ? _a : emulateEncodeInto(textEncoding.encodeUtf8.bind(textEncoding)) });
}
function getTextEncoding() {
  const globals = globalThis;
  if (!globals[symbol]) {
    const textEncoder = new globals.TextEncoder();
    const textDecoder = new globals.TextDecoder();
    let textDecoderStrict;
    const config = {
      encodeUtf8(text) {
        return textEncoder.encode(text);
      },
      decodeUtf8(bytes, strict) {
        if (strict) {
          if (!textDecoderStrict) {
            textDecoderStrict = new globals.TextDecoder("utf-8", {
              fatal: true
            });
          }
          return textDecoderStrict.decode(bytes);
        }
        return textDecoder.decode(bytes);
      },
      checkUtf8(text) {
        try {
          encodeURIComponent(text);
          return true;
        } catch (_) {
          return false;
        }
      }
    };
    if (textEncoder.encodeInto) {
      config.encodeUtf8Into = textEncoder.encodeInto.bind(textEncoder);
    }
    const nativeStringIsWellFormed = String.prototype.isWellFormed;
    if (nativeStringIsWellFormed) {
      config.checkUtf8 = (text) => {
        return nativeStringIsWellFormed.call(text);
      };
    }
    configureTextEncoding(config);
  }
  return globals[symbol];
}
function emulateEncodeInto(encodeUtf8) {
  return (text, dest) => {
    const bytes = encodeUtf8(text);
    dest.set(bytes);
    return { written: bytes.byteLength };
  };
}

// ../../node_modules/.pnpm/@bufbuild+protobuf@2.14.0/node_modules/@bufbuild/protobuf/dist/esm/wire/binary-encoding.js
var WireType;
(function(WireType2) {
  WireType2[WireType2["Varint"] = 0] = "Varint";
  WireType2[WireType2["Bit64"] = 1] = "Bit64";
  WireType2[WireType2["LengthDelimited"] = 2] = "LengthDelimited";
  WireType2[WireType2["StartGroup"] = 3] = "StartGroup";
  WireType2[WireType2["EndGroup"] = 4] = "EndGroup";
  WireType2[WireType2["Bit32"] = 5] = "Bit32";
})(WireType || (WireType = {}));
var FLOAT32_MAX = 34028234663852886e22;
var FLOAT32_MIN = -34028234663852886e22;
var UINT32_MAX = 4294967295;
var INT32_MAX = 2147483647;
var INT32_MIN = -2147483648;
var BinaryWriter = class {
  constructor(encodeUtf8) {
    this.stackPos = [];
    this.encodeUtf8Into = encodeUtf8 ? emulateEncodeInto(encodeUtf8) : getTextEncoding().encodeUtf8Into;
    this.buffer = EMPTY_BUFFER;
    this.viewCache = EMPTY_VIEW;
    this.pos = 0;
  }
  ensureCapacity(size) {
    const required = this.pos + size;
    if (required > this.buffer.length) {
      let newLen = this.buffer.length || INITIAL_SIZE;
      while (newLen < required)
        newLen *= 2;
      const newBuf = new Uint8Array(newLen);
      if (this.pos > 0)
        newBuf.set(this.buffer);
      this.buffer = newBuf;
    }
  }
  /**
   * The DataView over `buffer`, rebuilt only if the buffer has grown since it
   * was last used.
   */
  view() {
    const bytes = this.buffer;
    const view = this.viewCache;
    if (view.byteLength === bytes.byteLength)
      return view;
    const newView = new DataView(bytes.buffer);
    this.viewCache = newView;
    return newView;
  }
  /**
   * Return all bytes written and reset this writer.
   */
  finish() {
    const result = this.buffer.slice(0, this.pos);
    this.pos = 0;
    this.stackPos = [];
    return result;
  }
  /**
   * Start a new fork for length-delimited data like a message
   * or a packed repeated field.
   *
   * Must be joined later with `join()`.
   */
  fork() {
    this.stackPos.push(this.pos);
    this.ensureCapacity(DEFAULT_LEN_PREFIX_SIZE);
    this.buffer[this.pos++] = 0;
    return this;
  }
  /**
   * Join the last fork. Write its length and bytes, then
   * return to the previous state.
   */
  join() {
    const forkPos = this.stackPos.pop();
    if (forkPos === void 0)
      throw new Error("invalid state, fork stack empty");
    const len = this.pos - forkPos - DEFAULT_LEN_PREFIX_SIZE;
    const lenPrefixSize = varint32Size(len);
    if (lenPrefixSize > DEFAULT_LEN_PREFIX_SIZE) {
      this.ensureCapacity(lenPrefixSize - DEFAULT_LEN_PREFIX_SIZE);
      this.buffer.copyWithin(forkPos + lenPrefixSize, forkPos + DEFAULT_LEN_PREFIX_SIZE, this.pos);
    }
    this.pos = forkPos;
    this.uint32(len);
    this.pos += len;
    return this;
  }
  /**
   * Writes a tag (field number and wire type).
   *
   * Equivalent to `uint32( (fieldNo << 3 | type) >>> 0 )`.
   *
   * Generated code should compute the tag ahead of time and call `uint32()`.
   */
  tag(fieldNo, type) {
    return this.uint32((fieldNo << 3 | type) >>> 0);
  }
  /**
   * Write a chunk of raw bytes.
   */
  raw(chunk) {
    this.ensureCapacity(chunk.length);
    this.buffer.set(chunk, this.pos);
    this.pos += chunk.length;
    return this;
  }
  /**
   * Write a `uint32` value, an unsigned 32 bit varint.
   */
  uint32(value) {
    assertUInt32(value);
    this.ensureCapacity(5);
    if (value < 128) {
      this.buffer[this.pos++] = value;
      return this;
    }
    while (value > 127) {
      this.buffer[this.pos++] = value & 127 | 128;
      value >>>= 7;
    }
    this.buffer[this.pos++] = value;
    return this;
  }
  /**
   * Write a `int32` value, a signed 32 bit varint.
   */
  int32(value) {
    assertInt32(value);
    if (value >= 0) {
      return this.uint32(value);
    }
    this.ensureCapacity(10);
    for (let i = 0; i < 9; i++) {
      this.buffer[this.pos++] = value & 127 | 128;
      value >>= 7;
    }
    this.buffer[this.pos++] = 1;
    return this;
  }
  /**
   * Write a `bool` value, a varint.
   */
  bool(value) {
    this.ensureCapacity(1);
    this.buffer[this.pos++] = value ? 1 : 0;
    return this;
  }
  /**
   * Write a `bytes` value, length-delimited arbitrary data.
   */
  bytes(value) {
    this.uint32(value.byteLength);
    return this.raw(value);
  }
  /**
   * Write a `string` value, length-delimited data converted to UTF-8 text.
   */
  string(value) {
    if (typeof value !== "string") {
      value = String(value);
    }
    const len = value.length;
    if (len <= ASCII_MAX_LENGTH) {
      this.ensureCapacity(len + 1);
      const ascii = this.buffer;
      let pos = this.pos;
      ascii[pos++] = len;
      let i = 0;
      for (; i < len; i++) {
        const code = value.charCodeAt(i);
        if (code > 127)
          break;
        ascii[pos++] = code;
      }
      if (i == len) {
        this.pos = pos;
        return this;
      }
    }
    this.ensureCapacity(len * 3 + 5);
    const lenPrefixSizeGuess = varint32Size(len);
    const buf = this.buffer;
    const start = this.pos;
    const { written } = this.encodeUtf8Into(value, buf.subarray(start + lenPrefixSizeGuess));
    const lenPrefixSize = varint32Size(written);
    if (lenPrefixSize != lenPrefixSizeGuess) {
      buf.copyWithin(start + lenPrefixSize, start + lenPrefixSizeGuess, start + lenPrefixSizeGuess + written);
    }
    this.uint32(written);
    this.pos += written;
    return this;
  }
  /**
   * Write a `float` value, 32-bit floating point number.
   */
  float(value) {
    assertFloat32(value);
    this.ensureCapacity(4);
    this.view().setFloat32(this.pos, value, true);
    this.pos += 4;
    return this;
  }
  /**
   * Write a `double` value, a 64-bit floating point number.
   */
  double(value) {
    this.ensureCapacity(8);
    this.view().setFloat64(this.pos, value, true);
    this.pos += 8;
    return this;
  }
  /**
   * Write a `fixed32` value, an unsigned, fixed-length 32-bit integer.
   */
  fixed32(value) {
    assertUInt32(value);
    this.ensureCapacity(4);
    this.view().setUint32(this.pos, value, true);
    this.pos += 4;
    return this;
  }
  /**
   * Write a `sfixed32` value, a signed, fixed-length 32-bit integer.
   */
  sfixed32(value) {
    assertInt32(value);
    this.ensureCapacity(4);
    this.view().setInt32(this.pos, value, true);
    this.pos += 4;
    return this;
  }
  /**
   * Write a `sint32` value, a signed, zigzag-encoded 32-bit varint.
   */
  sint32(value) {
    assertInt32(value);
    return this.uint32((value << 1 ^ value >> 31) >>> 0);
  }
  /**
   * Write a `sfixed64` value, a signed, fixed-length 64-bit integer.
   */
  sfixed64(value) {
    const tc = protoInt64.enc(value);
    this.ensureCapacity(8);
    const view = this.view();
    view.setInt32(this.pos, tc.lo, true);
    view.setInt32(this.pos + 4, tc.hi, true);
    this.pos += 8;
    return this;
  }
  /**
   * Write a `fixed64` value, an unsigned, fixed-length 64 bit integer.
   */
  fixed64(value) {
    const tc = protoInt64.uEnc(value);
    this.ensureCapacity(8);
    const view = this.view();
    view.setInt32(this.pos, tc.lo, true);
    view.setInt32(this.pos + 4, tc.hi, true);
    this.pos += 8;
    return this;
  }
  /**
   * Write a `int64` value, a signed 64-bit varint.
   */
  int64(value) {
    const tc = protoInt64.enc(value);
    return this.writeVarint64(tc.lo, tc.hi);
  }
  /**
   * Write a `sint64` value, a signed, zig-zag-encoded 64-bit varint.
   */
  sint64(value) {
    const tc = protoInt64.enc(value), sign = tc.hi >> 31, lo = tc.lo << 1 ^ sign, hi = (tc.hi << 1 | tc.lo >>> 31) ^ sign;
    return this.writeVarint64(lo, hi);
  }
  /**
   * Write a `uint64` value, an unsigned 64-bit varint.
   */
  uint64(value) {
    const tc = protoInt64.uEnc(value);
    return this.writeVarint64(tc.lo, tc.hi);
  }
  /**
   * Write a 64-bit varint directly into the buffer. Accepts the value as
   * split low/high 32-bit words.
   *
   * Ported from varint64write() to avoid the intermediate number[] buffer.
   * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/writer.js#L344
   */
  writeVarint64(lo, hi) {
    this.ensureCapacity(10);
    const buf = this.buffer;
    let pos = this.pos;
    for (let i = 0; i < 28; i = i + 7) {
      const shift = lo >>> i;
      const hasNext = !(shift >>> 7 == 0 && hi == 0);
      buf[pos++] = (hasNext ? shift | 128 : shift) & 255;
      if (!hasNext) {
        this.pos = pos;
        return this;
      }
    }
    const splitBits = lo >>> 28 & 15 | (hi & 7) << 4;
    const hasMoreBits = !(hi >> 3 == 0);
    buf[pos++] = (hasMoreBits ? splitBits | 128 : splitBits) & 255;
    if (!hasMoreBits) {
      this.pos = pos;
      return this;
    }
    for (let i = 3; i < 31; i = i + 7) {
      const shift = hi >>> i;
      const hasNext = !(shift >>> 7 == 0);
      buf[pos++] = (hasNext ? shift | 128 : shift) & 255;
      if (!hasNext) {
        this.pos = pos;
        return this;
      }
    }
    buf[pos++] = hi >>> 31 & 1;
    this.pos = pos;
    return this;
  }
};
var INITIAL_SIZE = 128;
var DEFAULT_LEN_PREFIX_SIZE = 1;
var EMPTY_BUFFER = new Uint8Array(0);
var EMPTY_VIEW = new DataView(EMPTY_BUFFER.buffer);
var ASCII_MAX_LENGTH = 32;
function varint32Size(value) {
  if (value < 128)
    return 1;
  if (value < 16384)
    return 2;
  if (value < 2097152)
    return 3;
  if (value < 268435456)
    return 4;
  return 5;
}
var BinaryReader = class {
  constructor(buf, decodeUtf8 = getTextEncoding().decodeUtf8) {
    this.decodeUtf8 = decodeUtf8;
    this.varint64Lo = 0;
    this.varint64Hi = 0;
    this.varint64 = varint64read;
    this.uint32 = varint32read;
    this.buf = buf;
    this.len = buf.length;
    this.pos = 0;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  /**
   * Reads a tag - field number and wire type. Tags are uint32 varints; values
   * that do not fit in uint32 are rejected.
   */
  tag() {
    const start = this.pos;
    const tag = this.uint32();
    const bytesRead = this.pos - start;
    if (bytesRead > 5 || bytesRead == 5 && this.buf[this.pos - 1] > 15) {
      throw new Error("illegal tag: varint overflows uint32");
    }
    const fieldNo = tag >>> 3;
    const wireType = tag & 7;
    if (fieldNo <= 0 || wireType > 5) {
      throw new Error("illegal tag: field no " + fieldNo + " wire type " + wireType);
    }
    return [fieldNo, wireType];
  }
  /**
   * Skip one element and return the skipped data.
   *
   * When skipping StartGroup, provide the tags field number to check for
   * matching field number in the EndGroup tag. Recursion into nested groups
   * is guarded by the `recursionLimit` argument: When the limit is reached,
   * this method throws.
   */
  skip(wireType, fieldNo, recursionLimit = 100) {
    let start = this.pos;
    switch (wireType) {
      case WireType.Varint:
        while (this.buf[this.pos++] & 128) {
        }
        break;
      // @ts-ignore TS7029: Fallthrough case in switch -- ignore instead of expect-error for compiler settings without noFallthroughCasesInSwitch: true
      case WireType.Bit64:
        this.pos += 4;
      case WireType.Bit32:
        this.pos += 4;
        break;
      case WireType.LengthDelimited:
        let len = this.uint32();
        this.pos += len;
        break;
      case WireType.StartGroup:
        if (recursionLimit <= 0) {
          throw new Error("maximum recursion depth reached");
        }
        for (; ; ) {
          const [fn, wt] = this.tag();
          if (wt === WireType.EndGroup) {
            if (fieldNo !== void 0 && fn !== fieldNo) {
              throw new Error("invalid end group tag");
            }
            break;
          }
          this.skip(wt, fn, recursionLimit - 1);
        }
        break;
      default:
        throw new Error("cant skip wire type " + wireType);
    }
    this.assertBounds();
    return this.buf.subarray(start, this.pos);
  }
  /**
   * Throws error if position in byte array is out of range.
   */
  assertBounds() {
    if (this.pos > this.len)
      throw new RangeError("premature EOF");
  }
  /**
   * Read a `int32` field, a signed 32 bit varint.
   */
  int32() {
    return this.uint32() | 0;
  }
  /**
   * Read a `sint32` field, a signed, zigzag-encoded 32-bit varint.
   */
  sint32() {
    let zze = this.uint32();
    return zze >>> 1 ^ -(zze & 1);
  }
  /**
   * Read a `int64` field, a signed 64-bit varint.
   */
  int64() {
    this.varint64();
    return protoInt64.dec(this.varint64Lo, this.varint64Hi);
  }
  /**
   * Read a `uint64` field, an unsigned 64-bit varint.
   */
  uint64() {
    this.varint64();
    return protoInt64.uDec(this.varint64Lo, this.varint64Hi);
  }
  /**
   * Read a `sint64` field, a signed, zig-zag-encoded 64-bit varint.
   */
  sint64() {
    this.varint64();
    let lo = this.varint64Lo;
    let hi = this.varint64Hi;
    let s = -(lo & 1);
    lo = (lo >>> 1 | (hi & 1) << 31) ^ s;
    hi = hi >>> 1 ^ s;
    return protoInt64.dec(lo, hi);
  }
  /**
   * Read a `bool` field, a variant.
   */
  bool() {
    const b = this.buf[this.pos];
    if (b < 128) {
      this.pos++;
      return b !== 0;
    }
    this.varint64();
    return this.varint64Lo !== 0 || this.varint64Hi !== 0;
  }
  /**
   * Read a `fixed32` field, an unsigned, fixed-length 32-bit integer.
   */
  fixed32() {
    return this.view.getUint32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `sfixed32` field, a signed, fixed-length 32-bit integer.
   */
  sfixed32() {
    return this.view.getInt32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `fixed64` field, an unsigned, fixed-length 64 bit integer.
   */
  fixed64() {
    return protoInt64.uDec(this.sfixed32(), this.sfixed32());
  }
  /**
   * Read a `fixed64` field, a signed, fixed-length 64-bit integer.
   */
  sfixed64() {
    return protoInt64.dec(this.sfixed32(), this.sfixed32());
  }
  /**
   * Read a `float` field, 32-bit floating point number.
   */
  float() {
    return this.view.getFloat32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `double` field, a 64-bit floating point number.
   */
  double() {
    return this.view.getFloat64((this.pos += 8) - 8, true);
  }
  /**
   * Read a `bytes` field, length-delimited arbitrary data.
   */
  bytes() {
    let len = this.uint32(), start = this.pos;
    this.pos += len;
    this.assertBounds();
    return this.buf.subarray(start, start + len);
  }
  /**
   * Read a `string` field, length-delimited data converted to UTF-8 text. If
   * `strict` is true, throw on invalid UTF-8 instead of substituting U+FFFD.
   */
  string(strict) {
    const bytes = this.bytes();
    const len = bytes.length;
    if (len <= ASCII_MAX_LENGTH) {
      const codes = new Array(len);
      for (let i = 0; i < len; i++) {
        const byte = bytes[i];
        if (byte > 127) {
          return this.decodeUtf8(bytes, strict);
        }
        codes[i] = byte;
      }
      return String.fromCharCode.apply(String, codes);
    }
    return this.decodeUtf8(bytes, strict);
  }
};
function assertInt32(arg) {
  if (typeof arg == "string") {
    arg = Number(arg);
  } else if (typeof arg != "number") {
    throw new Error("invalid int32: " + typeof arg);
  }
  if (!Number.isInteger(arg) || arg > INT32_MAX || arg < INT32_MIN)
    throw new Error("invalid int32: " + arg);
}
function assertUInt32(arg) {
  if (typeof arg == "string") {
    arg = Number(arg);
  } else if (typeof arg != "number") {
    throw new Error("invalid uint32: " + typeof arg);
  }
  if (!Number.isInteger(arg) || arg > UINT32_MAX || arg < 0)
    throw new Error("invalid uint32: " + arg);
}
function assertFloat32(arg) {
  if (typeof arg == "string") {
    const o = arg;
    arg = Number(arg);
    if (Number.isNaN(arg) && o !== "NaN") {
      throw new Error("invalid float32: " + o);
    }
  } else if (typeof arg != "number") {
    throw new Error("invalid float32: " + typeof arg);
  }
  if (Number.isFinite(arg) && (arg > FLOAT32_MAX || arg < FLOAT32_MIN))
    throw new Error("invalid float32: " + arg);
}

// ../../generated/ts/alpha/common/v1/common.ts
function createBaseFieldViolation() {
  return { fieldPath: "", reasonCode: "" };
}
var FieldViolation = {
  encode(message, writer = new BinaryWriter()) {
    if (message.fieldPath !== "") {
      writer.uint32(10).string(message.fieldPath);
    }
    if (message.reasonCode !== "") {
      writer.uint32(18).string(message.reasonCode);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseFieldViolation();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.fieldPath = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.reasonCode = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      fieldPath: isSet(object.fieldPath) ? globalThis.String(object.fieldPath) : isSet(object.field_path) ? globalThis.String(object.field_path) : "",
      reasonCode: isSet(object.reasonCode) ? globalThis.String(object.reasonCode) : isSet(object.reason_code) ? globalThis.String(object.reason_code) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.fieldPath !== "") {
      obj.fieldPath = message.fieldPath;
    }
    if (message.reasonCode !== "") {
      obj.reasonCode = message.reasonCode;
    }
    return obj;
  },
  create(base) {
    return FieldViolation.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseFieldViolation();
    message.fieldPath = object.fieldPath ?? "";
    message.reasonCode = object.reasonCode ?? "";
    return message;
  }
};
function createBaseValidationError() {
  return { violations: [] };
}
var ValidationError = {
  encode(message, writer = new BinaryWriter()) {
    for (const v of message.violations) {
      FieldViolation.encode(v, writer.uint32(10).fork()).join();
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseValidationError();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.violations.push(FieldViolation.decode(reader, reader.uint32()));
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      violations: globalThis.Array.isArray(object?.violations) ? object.violations.map((e) => FieldViolation.fromJSON(e)) : []
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.violations?.length) {
      obj.violations = message.violations.map((e) => FieldViolation.toJSON(e));
    }
    return obj;
  },
  create(base) {
    return ValidationError.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseValidationError();
    message.violations = object.violations?.map((e) => FieldViolation.fromPartial(e)) || [];
    return message;
  }
};
function createBaseRetryInfo() {
  return { retryAfterMs: 0n };
}
var RetryInfo = {
  encode(message, writer = new BinaryWriter()) {
    if (message.retryAfterMs !== 0n) {
      if (BigInt.asUintN(64, message.retryAfterMs) !== message.retryAfterMs) {
        throw new globalThis.Error("value provided for field message.retryAfterMs of type uint64 too large");
      }
      writer.uint32(8).uint64(message.retryAfterMs);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseRetryInfo();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 8) {
              break;
            }
            message.retryAfterMs = reader.uint64();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      retryAfterMs: isSet(object.retryAfterMs) ? BigInt(object.retryAfterMs) : isSet(object.retry_after_ms) ? BigInt(object.retry_after_ms) : 0n
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.retryAfterMs !== 0n) {
      obj.retryAfterMs = message.retryAfterMs.toString();
    }
    return obj;
  },
  create(base) {
    return RetryInfo.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseRetryInfo();
    message.retryAfterMs = object.retryAfterMs !== void 0 && object.retryAfterMs !== null ? BigInt(object.retryAfterMs) : 0n;
    return message;
  }
};
function createBasePolicyError() {
  return { requiredFeature: "", requiredScope: "", decisionId: "" };
}
var PolicyError = {
  encode(message, writer = new BinaryWriter()) {
    if (message.requiredFeature !== "") {
      writer.uint32(10).string(message.requiredFeature);
    }
    if (message.requiredScope !== "") {
      writer.uint32(18).string(message.requiredScope);
    }
    if (message.decisionId !== "") {
      writer.uint32(26).string(message.decisionId);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBasePolicyError();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.requiredFeature = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.requiredScope = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.decisionId = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      requiredFeature: isSet(object.requiredFeature) ? globalThis.String(object.requiredFeature) : isSet(object.required_feature) ? globalThis.String(object.required_feature) : "",
      requiredScope: isSet(object.requiredScope) ? globalThis.String(object.requiredScope) : isSet(object.required_scope) ? globalThis.String(object.required_scope) : "",
      decisionId: isSet(object.decisionId) ? globalThis.String(object.decisionId) : isSet(object.decision_id) ? globalThis.String(object.decision_id) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.requiredFeature !== "") {
      obj.requiredFeature = message.requiredFeature;
    }
    if (message.requiredScope !== "") {
      obj.requiredScope = message.requiredScope;
    }
    if (message.decisionId !== "") {
      obj.decisionId = message.decisionId;
    }
    return obj;
  },
  create(base) {
    return PolicyError.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBasePolicyError();
    message.requiredFeature = object.requiredFeature ?? "";
    message.requiredScope = object.requiredScope ?? "";
    message.decisionId = object.decisionId ?? "";
    return message;
  }
};
function createBaseConflictError() {
  return { resourceType: "", resourceId: "", currentState: "" };
}
var ConflictError = {
  encode(message, writer = new BinaryWriter()) {
    if (message.resourceType !== "") {
      writer.uint32(10).string(message.resourceType);
    }
    if (message.resourceId !== "") {
      writer.uint32(18).string(message.resourceId);
    }
    if (message.currentState !== "") {
      writer.uint32(26).string(message.currentState);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseConflictError();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.resourceType = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.resourceId = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.currentState = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      resourceType: isSet(object.resourceType) ? globalThis.String(object.resourceType) : isSet(object.resource_type) ? globalThis.String(object.resource_type) : "",
      resourceId: isSet(object.resourceId) ? globalThis.String(object.resourceId) : isSet(object.resource_id) ? globalThis.String(object.resource_id) : "",
      currentState: isSet(object.currentState) ? globalThis.String(object.currentState) : isSet(object.current_state) ? globalThis.String(object.current_state) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.resourceType !== "") {
      obj.resourceType = message.resourceType;
    }
    if (message.resourceId !== "") {
      obj.resourceId = message.resourceId;
    }
    if (message.currentState !== "") {
      obj.currentState = message.currentState;
    }
    return obj;
  },
  create(base) {
    return ConflictError.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseConflictError();
    message.resourceType = object.resourceType ?? "";
    message.resourceId = object.resourceId ?? "";
    message.currentState = object.currentState ?? "";
    return message;
  }
};
function createBaseErrorDetail() {
  return { validation: void 0, retry: void 0, policy: void 0, conflict: void 0 };
}
var ErrorDetail = {
  encode(message, writer = new BinaryWriter()) {
    if (message.validation !== void 0) {
      ValidationError.encode(message.validation, writer.uint32(10).fork()).join();
    }
    if (message.retry !== void 0) {
      RetryInfo.encode(message.retry, writer.uint32(18).fork()).join();
    }
    if (message.policy !== void 0) {
      PolicyError.encode(message.policy, writer.uint32(26).fork()).join();
    }
    if (message.conflict !== void 0) {
      ConflictError.encode(message.conflict, writer.uint32(34).fork()).join();
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseErrorDetail();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.validation = ValidationError.decode(reader, reader.uint32());
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.retry = RetryInfo.decode(reader, reader.uint32());
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.policy = PolicyError.decode(reader, reader.uint32());
            continue;
          }
          case 4: {
            if (tag !== 34) {
              break;
            }
            message.conflict = ConflictError.decode(reader, reader.uint32());
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      validation: isSet(object.validation) ? ValidationError.fromJSON(object.validation) : void 0,
      retry: isSet(object.retry) ? RetryInfo.fromJSON(object.retry) : void 0,
      policy: isSet(object.policy) ? PolicyError.fromJSON(object.policy) : void 0,
      conflict: isSet(object.conflict) ? ConflictError.fromJSON(object.conflict) : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.validation !== void 0) {
      obj.validation = ValidationError.toJSON(message.validation);
    }
    if (message.retry !== void 0) {
      obj.retry = RetryInfo.toJSON(message.retry);
    }
    if (message.policy !== void 0) {
      obj.policy = PolicyError.toJSON(message.policy);
    }
    if (message.conflict !== void 0) {
      obj.conflict = ConflictError.toJSON(message.conflict);
    }
    return obj;
  },
  create(base) {
    return ErrorDetail.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseErrorDetail();
    message.validation = object.validation !== void 0 && object.validation !== null ? ValidationError.fromPartial(object.validation) : void 0;
    message.retry = object.retry !== void 0 && object.retry !== null ? RetryInfo.fromPartial(object.retry) : void 0;
    message.policy = object.policy !== void 0 && object.policy !== null ? PolicyError.fromPartial(object.policy) : void 0;
    message.conflict = object.conflict !== void 0 && object.conflict !== null ? ConflictError.fromPartial(object.conflict) : void 0;
    return message;
  }
};
function createBaseAlphaError() {
  return { code: "", category: "", retryable: false, userMessageKey: "", diagnosticId: "", details: [] };
}
var AlphaError = {
  encode(message, writer = new BinaryWriter()) {
    if (message.code !== "") {
      writer.uint32(10).string(message.code);
    }
    if (message.category !== "") {
      writer.uint32(18).string(message.category);
    }
    if (message.retryable !== false) {
      writer.uint32(24).bool(message.retryable);
    }
    if (message.userMessageKey !== "") {
      writer.uint32(34).string(message.userMessageKey);
    }
    if (message.diagnosticId !== "") {
      writer.uint32(42).string(message.diagnosticId);
    }
    for (const v of message.details) {
      ErrorDetail.encode(v, writer.uint32(50).fork()).join();
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseAlphaError();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.code = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.category = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 24) {
              break;
            }
            message.retryable = reader.bool();
            continue;
          }
          case 4: {
            if (tag !== 34) {
              break;
            }
            message.userMessageKey = reader.string();
            continue;
          }
          case 5: {
            if (tag !== 42) {
              break;
            }
            message.diagnosticId = reader.string();
            continue;
          }
          case 6: {
            if (tag !== 50) {
              break;
            }
            message.details.push(ErrorDetail.decode(reader, reader.uint32()));
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      code: isSet(object.code) ? globalThis.String(object.code) : "",
      category: isSet(object.category) ? globalThis.String(object.category) : "",
      retryable: isSet(object.retryable) ? globalThis.Boolean(object.retryable) : false,
      userMessageKey: isSet(object.userMessageKey) ? globalThis.String(object.userMessageKey) : isSet(object.user_message_key) ? globalThis.String(object.user_message_key) : "",
      diagnosticId: isSet(object.diagnosticId) ? globalThis.String(object.diagnosticId) : isSet(object.diagnostic_id) ? globalThis.String(object.diagnostic_id) : "",
      details: globalThis.Array.isArray(object?.details) ? object.details.map((e) => ErrorDetail.fromJSON(e)) : []
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.code !== "") {
      obj.code = message.code;
    }
    if (message.category !== "") {
      obj.category = message.category;
    }
    if (message.retryable !== false) {
      obj.retryable = message.retryable;
    }
    if (message.userMessageKey !== "") {
      obj.userMessageKey = message.userMessageKey;
    }
    if (message.diagnosticId !== "") {
      obj.diagnosticId = message.diagnosticId;
    }
    if (message.details?.length) {
      obj.details = message.details.map((e) => ErrorDetail.toJSON(e));
    }
    return obj;
  },
  create(base) {
    return AlphaError.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseAlphaError();
    message.code = object.code ?? "";
    message.category = object.category ?? "";
    message.retryable = object.retryable ?? false;
    message.userMessageKey = object.userMessageKey ?? "";
    message.diagnosticId = object.diagnosticId ?? "";
    message.details = object.details?.map((e) => ErrorDetail.fromPartial(e)) || [];
    return message;
  }
};
function isSet(value) {
  return value !== null && value !== void 0;
}

// ../../generated/ts/alpha/agent/v1/agent.ts
function agentRoleFromJSON(object) {
  switch (object) {
    case 0:
    case "AGENT_ROLE_UNSPECIFIED":
      return 0 /* AGENT_ROLE_UNSPECIFIED */;
    case 1:
    case "AGENT_ROLE_USER":
      return 1 /* AGENT_ROLE_USER */;
    case 2:
    case "AGENT_ROLE_ASSISTANT":
      return 2 /* AGENT_ROLE_ASSISTANT */;
    case 3:
    case "AGENT_ROLE_SYSTEM":
      return 3 /* AGENT_ROLE_SYSTEM */;
    case 4:
    case "AGENT_ROLE_TOOL":
      return 4 /* AGENT_ROLE_TOOL */;
    case -1:
    case "UNRECOGNIZED":
    default:
      return -1 /* UNRECOGNIZED */;
  }
}
function agentRoleToJSON(object) {
  switch (object) {
    case 0 /* AGENT_ROLE_UNSPECIFIED */:
      return "AGENT_ROLE_UNSPECIFIED";
    case 1 /* AGENT_ROLE_USER */:
      return "AGENT_ROLE_USER";
    case 2 /* AGENT_ROLE_ASSISTANT */:
      return "AGENT_ROLE_ASSISTANT";
    case 3 /* AGENT_ROLE_SYSTEM */:
      return "AGENT_ROLE_SYSTEM";
    case 4 /* AGENT_ROLE_TOOL */:
      return "AGENT_ROLE_TOOL";
    case -1 /* UNRECOGNIZED */:
    default:
      return "UNRECOGNIZED";
  }
}
function createBaseStructuredValue() {
  return { schemaId: "", canonicalJson: new Uint8Array(0) };
}
var StructuredValue = {
  encode(message, writer = new BinaryWriter()) {
    if (message.schemaId !== "") {
      writer.uint32(10).string(message.schemaId);
    }
    if (message.canonicalJson.length !== 0) {
      writer.uint32(18).bytes(message.canonicalJson);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseStructuredValue();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.schemaId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.canonicalJson = reader.bytes();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      schemaId: isSet2(object.schemaId) ? globalThis.String(object.schemaId) : isSet2(object.schema_id) ? globalThis.String(object.schema_id) : "",
      canonicalJson: isSet2(object.canonicalJson) ? bytesFromBase64(object.canonicalJson) : isSet2(object.canonical_json) ? bytesFromBase64(object.canonical_json) : new Uint8Array(0)
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.schemaId !== "") {
      obj.schemaId = message.schemaId;
    }
    if (message.canonicalJson.length !== 0) {
      obj.canonicalJson = base64FromBytes(message.canonicalJson);
    }
    return obj;
  },
  create(base) {
    return StructuredValue.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseStructuredValue();
    message.schemaId = object.schemaId ?? "";
    message.canonicalJson = object.canonicalJson ?? new Uint8Array(0);
    return message;
  }
};
function createBaseFileRef() {
  return { artifactId: "", mediaType: "", displayName: "" };
}
var FileRef = {
  encode(message, writer = new BinaryWriter()) {
    if (message.artifactId !== "") {
      writer.uint32(10).string(message.artifactId);
    }
    if (message.mediaType !== "") {
      writer.uint32(18).string(message.mediaType);
    }
    if (message.displayName !== "") {
      writer.uint32(26).string(message.displayName);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseFileRef();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.artifactId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.mediaType = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.displayName = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      artifactId: isSet2(object.artifactId) ? globalThis.String(object.artifactId) : isSet2(object.artifact_id) ? globalThis.String(object.artifact_id) : "",
      mediaType: isSet2(object.mediaType) ? globalThis.String(object.mediaType) : isSet2(object.media_type) ? globalThis.String(object.media_type) : "",
      displayName: isSet2(object.displayName) ? globalThis.String(object.displayName) : isSet2(object.display_name) ? globalThis.String(object.display_name) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.artifactId !== "") {
      obj.artifactId = message.artifactId;
    }
    if (message.mediaType !== "") {
      obj.mediaType = message.mediaType;
    }
    if (message.displayName !== "") {
      obj.displayName = message.displayName;
    }
    return obj;
  },
  create(base) {
    return FileRef.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseFileRef();
    message.artifactId = object.artifactId ?? "";
    message.mediaType = object.mediaType ?? "";
    message.displayName = object.displayName ?? "";
    return message;
  }
};
function createBaseAgentContentPart() {
  return { text: void 0, file: void 0, data: void 0 };
}
var AgentContentPart = {
  encode(message, writer = new BinaryWriter()) {
    if (message.text !== void 0) {
      writer.uint32(10).string(message.text);
    }
    if (message.file !== void 0) {
      FileRef.encode(message.file, writer.uint32(18).fork()).join();
    }
    if (message.data !== void 0) {
      StructuredValue.encode(message.data, writer.uint32(26).fork()).join();
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseAgentContentPart();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.text = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.file = FileRef.decode(reader, reader.uint32());
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.data = StructuredValue.decode(reader, reader.uint32());
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      text: isSet2(object.text) ? globalThis.String(object.text) : void 0,
      file: isSet2(object.file) ? FileRef.fromJSON(object.file) : void 0,
      data: isSet2(object.data) ? StructuredValue.fromJSON(object.data) : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.text !== void 0) {
      obj.text = message.text;
    }
    if (message.file !== void 0) {
      obj.file = FileRef.toJSON(message.file);
    }
    if (message.data !== void 0) {
      obj.data = StructuredValue.toJSON(message.data);
    }
    return obj;
  },
  create(base) {
    return AgentContentPart.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseAgentContentPart();
    message.text = object.text ?? void 0;
    message.file = object.file !== void 0 && object.file !== null ? FileRef.fromPartial(object.file) : void 0;
    message.data = object.data !== void 0 && object.data !== null ? StructuredValue.fromPartial(object.data) : void 0;
    return message;
  }
};
function createBaseAgentMessage() {
  return { messageId: "", role: 0, parts: [], createdAtUnixMs: 0n };
}
var AgentMessage = {
  encode(message, writer = new BinaryWriter()) {
    if (message.messageId !== "") {
      writer.uint32(10).string(message.messageId);
    }
    if (message.role !== 0) {
      writer.uint32(16).int32(message.role);
    }
    for (const v of message.parts) {
      AgentContentPart.encode(v, writer.uint32(26).fork()).join();
    }
    if (message.createdAtUnixMs !== 0n) {
      if (BigInt.asUintN(64, message.createdAtUnixMs) !== message.createdAtUnixMs) {
        throw new globalThis.Error("value provided for field message.createdAtUnixMs of type uint64 too large");
      }
      writer.uint32(32).uint64(message.createdAtUnixMs);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseAgentMessage();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.messageId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 16) {
              break;
            }
            message.role = reader.int32();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.parts.push(AgentContentPart.decode(reader, reader.uint32()));
            continue;
          }
          case 4: {
            if (tag !== 32) {
              break;
            }
            message.createdAtUnixMs = reader.uint64();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      messageId: isSet2(object.messageId) ? globalThis.String(object.messageId) : isSet2(object.message_id) ? globalThis.String(object.message_id) : "",
      role: isSet2(object.role) ? agentRoleFromJSON(object.role) : 0,
      parts: globalThis.Array.isArray(object?.parts) ? object.parts.map((e) => AgentContentPart.fromJSON(e)) : [],
      createdAtUnixMs: isSet2(object.createdAtUnixMs) ? BigInt(object.createdAtUnixMs) : isSet2(object.created_at_unix_ms) ? BigInt(object.created_at_unix_ms) : 0n
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.messageId !== "") {
      obj.messageId = message.messageId;
    }
    if (message.role !== 0) {
      obj.role = agentRoleToJSON(message.role);
    }
    if (message.parts?.length) {
      obj.parts = message.parts.map((e) => AgentContentPart.toJSON(e));
    }
    if (message.createdAtUnixMs !== 0n) {
      obj.createdAtUnixMs = message.createdAtUnixMs.toString();
    }
    return obj;
  },
  create(base) {
    return AgentMessage.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseAgentMessage();
    message.messageId = object.messageId ?? "";
    message.role = object.role ?? 0;
    message.parts = object.parts?.map((e) => AgentContentPart.fromPartial(e)) || [];
    message.createdAtUnixMs = object.createdAtUnixMs !== void 0 && object.createdAtUnixMs !== null ? BigInt(object.createdAtUnixMs) : 0n;
    return message;
  }
};
function createBaseToolDescriptor() {
  return {
    toolName: "",
    version: "",
    inputSchemaId: "",
    outputSchemaId: "",
    requiredFeature: "",
    requiredCallerScopes: [],
    sideEffectClass: "",
    approvalPolicy: "",
    timeoutMs: 0n,
    inputJsonSchema: new Uint8Array(0),
    description: ""
  };
}
var ToolDescriptor = {
  encode(message, writer = new BinaryWriter()) {
    if (message.toolName !== "") {
      writer.uint32(10).string(message.toolName);
    }
    if (message.version !== "") {
      writer.uint32(18).string(message.version);
    }
    if (message.inputSchemaId !== "") {
      writer.uint32(26).string(message.inputSchemaId);
    }
    if (message.outputSchemaId !== "") {
      writer.uint32(34).string(message.outputSchemaId);
    }
    if (message.requiredFeature !== "") {
      writer.uint32(42).string(message.requiredFeature);
    }
    for (const v of message.requiredCallerScopes) {
      writer.uint32(50).string(v);
    }
    if (message.sideEffectClass !== "") {
      writer.uint32(58).string(message.sideEffectClass);
    }
    if (message.approvalPolicy !== "") {
      writer.uint32(66).string(message.approvalPolicy);
    }
    if (message.timeoutMs !== 0n) {
      if (BigInt.asUintN(64, message.timeoutMs) !== message.timeoutMs) {
        throw new globalThis.Error("value provided for field message.timeoutMs of type uint64 too large");
      }
      writer.uint32(72).uint64(message.timeoutMs);
    }
    if (message.inputJsonSchema.length !== 0) {
      writer.uint32(82).bytes(message.inputJsonSchema);
    }
    if (message.description !== "") {
      writer.uint32(90).string(message.description);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseToolDescriptor();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.toolName = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.version = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.inputSchemaId = reader.string();
            continue;
          }
          case 4: {
            if (tag !== 34) {
              break;
            }
            message.outputSchemaId = reader.string();
            continue;
          }
          case 5: {
            if (tag !== 42) {
              break;
            }
            message.requiredFeature = reader.string();
            continue;
          }
          case 6: {
            if (tag !== 50) {
              break;
            }
            message.requiredCallerScopes.push(reader.string());
            continue;
          }
          case 7: {
            if (tag !== 58) {
              break;
            }
            message.sideEffectClass = reader.string();
            continue;
          }
          case 8: {
            if (tag !== 66) {
              break;
            }
            message.approvalPolicy = reader.string();
            continue;
          }
          case 9: {
            if (tag !== 72) {
              break;
            }
            message.timeoutMs = reader.uint64();
            continue;
          }
          case 10: {
            if (tag !== 82) {
              break;
            }
            message.inputJsonSchema = reader.bytes();
            continue;
          }
          case 11: {
            if (tag !== 90) {
              break;
            }
            message.description = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      toolName: isSet2(object.toolName) ? globalThis.String(object.toolName) : isSet2(object.tool_name) ? globalThis.String(object.tool_name) : "",
      version: isSet2(object.version) ? globalThis.String(object.version) : "",
      inputSchemaId: isSet2(object.inputSchemaId) ? globalThis.String(object.inputSchemaId) : isSet2(object.input_schema_id) ? globalThis.String(object.input_schema_id) : "",
      outputSchemaId: isSet2(object.outputSchemaId) ? globalThis.String(object.outputSchemaId) : isSet2(object.output_schema_id) ? globalThis.String(object.output_schema_id) : "",
      requiredFeature: isSet2(object.requiredFeature) ? globalThis.String(object.requiredFeature) : isSet2(object.required_feature) ? globalThis.String(object.required_feature) : "",
      requiredCallerScopes: globalThis.Array.isArray(object?.requiredCallerScopes) ? object.requiredCallerScopes.map((e) => globalThis.String(e)) : globalThis.Array.isArray(object?.required_caller_scopes) ? object.required_caller_scopes.map((e) => globalThis.String(e)) : [],
      sideEffectClass: isSet2(object.sideEffectClass) ? globalThis.String(object.sideEffectClass) : isSet2(object.side_effect_class) ? globalThis.String(object.side_effect_class) : "",
      approvalPolicy: isSet2(object.approvalPolicy) ? globalThis.String(object.approvalPolicy) : isSet2(object.approval_policy) ? globalThis.String(object.approval_policy) : "",
      timeoutMs: isSet2(object.timeoutMs) ? BigInt(object.timeoutMs) : isSet2(object.timeout_ms) ? BigInt(object.timeout_ms) : 0n,
      inputJsonSchema: isSet2(object.inputJsonSchema) ? bytesFromBase64(object.inputJsonSchema) : isSet2(object.input_json_schema) ? bytesFromBase64(object.input_json_schema) : new Uint8Array(0),
      description: isSet2(object.description) ? globalThis.String(object.description) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.toolName !== "") {
      obj.toolName = message.toolName;
    }
    if (message.version !== "") {
      obj.version = message.version;
    }
    if (message.inputSchemaId !== "") {
      obj.inputSchemaId = message.inputSchemaId;
    }
    if (message.outputSchemaId !== "") {
      obj.outputSchemaId = message.outputSchemaId;
    }
    if (message.requiredFeature !== "") {
      obj.requiredFeature = message.requiredFeature;
    }
    if (message.requiredCallerScopes?.length) {
      obj.requiredCallerScopes = message.requiredCallerScopes;
    }
    if (message.sideEffectClass !== "") {
      obj.sideEffectClass = message.sideEffectClass;
    }
    if (message.approvalPolicy !== "") {
      obj.approvalPolicy = message.approvalPolicy;
    }
    if (message.timeoutMs !== 0n) {
      obj.timeoutMs = message.timeoutMs.toString();
    }
    if (message.inputJsonSchema.length !== 0) {
      obj.inputJsonSchema = base64FromBytes(message.inputJsonSchema);
    }
    if (message.description !== "") {
      obj.description = message.description;
    }
    return obj;
  },
  create(base) {
    return ToolDescriptor.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseToolDescriptor();
    message.toolName = object.toolName ?? "";
    message.version = object.version ?? "";
    message.inputSchemaId = object.inputSchemaId ?? "";
    message.outputSchemaId = object.outputSchemaId ?? "";
    message.requiredFeature = object.requiredFeature ?? "";
    message.requiredCallerScopes = object.requiredCallerScopes?.map((e) => e) || [];
    message.sideEffectClass = object.sideEffectClass ?? "";
    message.approvalPolicy = object.approvalPolicy ?? "";
    message.timeoutMs = object.timeoutMs !== void 0 && object.timeoutMs !== null ? BigInt(object.timeoutMs) : 0n;
    message.inputJsonSchema = object.inputJsonSchema ?? new Uint8Array(0);
    message.description = object.description ?? "";
    return message;
  }
};
function createBaseTextDelta() {
  return { messageId: "", delta: "" };
}
var TextDelta = {
  encode(message, writer = new BinaryWriter()) {
    if (message.messageId !== "") {
      writer.uint32(10).string(message.messageId);
    }
    if (message.delta !== "") {
      writer.uint32(18).string(message.delta);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseTextDelta();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.messageId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.delta = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      messageId: isSet2(object.messageId) ? globalThis.String(object.messageId) : isSet2(object.message_id) ? globalThis.String(object.message_id) : "",
      delta: isSet2(object.delta) ? globalThis.String(object.delta) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.messageId !== "") {
      obj.messageId = message.messageId;
    }
    if (message.delta !== "") {
      obj.delta = message.delta;
    }
    return obj;
  },
  create(base) {
    return TextDelta.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseTextDelta();
    message.messageId = object.messageId ?? "";
    message.delta = object.delta ?? "";
    return message;
  }
};
function createBaseReasoningDelta() {
  return { delta: "" };
}
var ReasoningDelta = {
  encode(message, writer = new BinaryWriter()) {
    if (message.delta !== "") {
      writer.uint32(10).string(message.delta);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseReasoningDelta();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.delta = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return { delta: isSet2(object.delta) ? globalThis.String(object.delta) : "" };
  },
  toJSON(message) {
    const obj = {};
    if (message.delta !== "") {
      obj.delta = message.delta;
    }
    return obj;
  },
  create(base) {
    return ReasoningDelta.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseReasoningDelta();
    message.delta = object.delta ?? "";
    return message;
  }
};
function createBaseToolCallRequested() {
  return { toolCallId: "", toolName: "", arguments: void 0 };
}
var ToolCallRequested = {
  encode(message, writer = new BinaryWriter()) {
    if (message.toolCallId !== "") {
      writer.uint32(10).string(message.toolCallId);
    }
    if (message.toolName !== "") {
      writer.uint32(18).string(message.toolName);
    }
    if (message.arguments !== void 0) {
      StructuredValue.encode(message.arguments, writer.uint32(26).fork()).join();
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseToolCallRequested();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.toolCallId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.toolName = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.arguments = StructuredValue.decode(reader, reader.uint32());
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      toolCallId: isSet2(object.toolCallId) ? globalThis.String(object.toolCallId) : isSet2(object.tool_call_id) ? globalThis.String(object.tool_call_id) : "",
      toolName: isSet2(object.toolName) ? globalThis.String(object.toolName) : isSet2(object.tool_name) ? globalThis.String(object.tool_name) : "",
      arguments: isSet2(object.arguments) ? StructuredValue.fromJSON(object.arguments) : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.toolCallId !== "") {
      obj.toolCallId = message.toolCallId;
    }
    if (message.toolName !== "") {
      obj.toolName = message.toolName;
    }
    if (message.arguments !== void 0) {
      obj.arguments = StructuredValue.toJSON(message.arguments);
    }
    return obj;
  },
  create(base) {
    return ToolCallRequested.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseToolCallRequested();
    message.toolCallId = object.toolCallId ?? "";
    message.toolName = object.toolName ?? "";
    message.arguments = object.arguments !== void 0 && object.arguments !== null ? StructuredValue.fromPartial(object.arguments) : void 0;
    return message;
  }
};
function createBaseToolCallCompleted() {
  return { toolCallId: "", toolName: "", result: void 0, error: void 0 };
}
var ToolCallCompleted = {
  encode(message, writer = new BinaryWriter()) {
    if (message.toolCallId !== "") {
      writer.uint32(10).string(message.toolCallId);
    }
    if (message.toolName !== "") {
      writer.uint32(18).string(message.toolName);
    }
    if (message.result !== void 0) {
      StructuredValue.encode(message.result, writer.uint32(26).fork()).join();
    }
    if (message.error !== void 0) {
      AlphaError.encode(message.error, writer.uint32(34).fork()).join();
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseToolCallCompleted();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.toolCallId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.toolName = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.result = StructuredValue.decode(reader, reader.uint32());
            continue;
          }
          case 4: {
            if (tag !== 34) {
              break;
            }
            message.error = AlphaError.decode(reader, reader.uint32());
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      toolCallId: isSet2(object.toolCallId) ? globalThis.String(object.toolCallId) : isSet2(object.tool_call_id) ? globalThis.String(object.tool_call_id) : "",
      toolName: isSet2(object.toolName) ? globalThis.String(object.toolName) : isSet2(object.tool_name) ? globalThis.String(object.tool_name) : "",
      result: isSet2(object.result) ? StructuredValue.fromJSON(object.result) : void 0,
      error: isSet2(object.error) ? AlphaError.fromJSON(object.error) : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.toolCallId !== "") {
      obj.toolCallId = message.toolCallId;
    }
    if (message.toolName !== "") {
      obj.toolName = message.toolName;
    }
    if (message.result !== void 0) {
      obj.result = StructuredValue.toJSON(message.result);
    }
    if (message.error !== void 0) {
      obj.error = AlphaError.toJSON(message.error);
    }
    return obj;
  },
  create(base) {
    return ToolCallCompleted.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseToolCallCompleted();
    message.toolCallId = object.toolCallId ?? "";
    message.toolName = object.toolName ?? "";
    message.result = object.result !== void 0 && object.result !== null ? StructuredValue.fromPartial(object.result) : void 0;
    message.error = object.error !== void 0 && object.error !== null ? AlphaError.fromPartial(object.error) : void 0;
    return message;
  }
};
function createBaseUsageReported() {
  return {
    inputTokens: 0n,
    outputTokens: 0n,
    cacheReadTokens: 0n,
    cacheWriteTokens: 0n,
    providerRequestId: "",
    reasoningTokens: 0n,
    purpose: ""
  };
}
var UsageReported = {
  encode(message, writer = new BinaryWriter()) {
    if (message.inputTokens !== 0n) {
      if (BigInt.asUintN(64, message.inputTokens) !== message.inputTokens) {
        throw new globalThis.Error("value provided for field message.inputTokens of type uint64 too large");
      }
      writer.uint32(8).uint64(message.inputTokens);
    }
    if (message.outputTokens !== 0n) {
      if (BigInt.asUintN(64, message.outputTokens) !== message.outputTokens) {
        throw new globalThis.Error("value provided for field message.outputTokens of type uint64 too large");
      }
      writer.uint32(16).uint64(message.outputTokens);
    }
    if (message.cacheReadTokens !== 0n) {
      if (BigInt.asUintN(64, message.cacheReadTokens) !== message.cacheReadTokens) {
        throw new globalThis.Error("value provided for field message.cacheReadTokens of type uint64 too large");
      }
      writer.uint32(24).uint64(message.cacheReadTokens);
    }
    if (message.cacheWriteTokens !== 0n) {
      if (BigInt.asUintN(64, message.cacheWriteTokens) !== message.cacheWriteTokens) {
        throw new globalThis.Error("value provided for field message.cacheWriteTokens of type uint64 too large");
      }
      writer.uint32(32).uint64(message.cacheWriteTokens);
    }
    if (message.providerRequestId !== "") {
      writer.uint32(42).string(message.providerRequestId);
    }
    if (message.reasoningTokens !== 0n) {
      if (BigInt.asUintN(64, message.reasoningTokens) !== message.reasoningTokens) {
        throw new globalThis.Error("value provided for field message.reasoningTokens of type uint64 too large");
      }
      writer.uint32(48).uint64(message.reasoningTokens);
    }
    if (message.purpose !== "") {
      writer.uint32(58).string(message.purpose);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseUsageReported();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 8) {
              break;
            }
            message.inputTokens = reader.uint64();
            continue;
          }
          case 2: {
            if (tag !== 16) {
              break;
            }
            message.outputTokens = reader.uint64();
            continue;
          }
          case 3: {
            if (tag !== 24) {
              break;
            }
            message.cacheReadTokens = reader.uint64();
            continue;
          }
          case 4: {
            if (tag !== 32) {
              break;
            }
            message.cacheWriteTokens = reader.uint64();
            continue;
          }
          case 5: {
            if (tag !== 42) {
              break;
            }
            message.providerRequestId = reader.string();
            continue;
          }
          case 6: {
            if (tag !== 48) {
              break;
            }
            message.reasoningTokens = reader.uint64();
            continue;
          }
          case 7: {
            if (tag !== 58) {
              break;
            }
            message.purpose = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      inputTokens: isSet2(object.inputTokens) ? BigInt(object.inputTokens) : isSet2(object.input_tokens) ? BigInt(object.input_tokens) : 0n,
      outputTokens: isSet2(object.outputTokens) ? BigInt(object.outputTokens) : isSet2(object.output_tokens) ? BigInt(object.output_tokens) : 0n,
      cacheReadTokens: isSet2(object.cacheReadTokens) ? BigInt(object.cacheReadTokens) : isSet2(object.cache_read_tokens) ? BigInt(object.cache_read_tokens) : 0n,
      cacheWriteTokens: isSet2(object.cacheWriteTokens) ? BigInt(object.cacheWriteTokens) : isSet2(object.cache_write_tokens) ? BigInt(object.cache_write_tokens) : 0n,
      providerRequestId: isSet2(object.providerRequestId) ? globalThis.String(object.providerRequestId) : isSet2(object.provider_request_id) ? globalThis.String(object.provider_request_id) : "",
      reasoningTokens: isSet2(object.reasoningTokens) ? BigInt(object.reasoningTokens) : isSet2(object.reasoning_tokens) ? BigInt(object.reasoning_tokens) : 0n,
      purpose: isSet2(object.purpose) ? globalThis.String(object.purpose) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.inputTokens !== 0n) {
      obj.inputTokens = message.inputTokens.toString();
    }
    if (message.outputTokens !== 0n) {
      obj.outputTokens = message.outputTokens.toString();
    }
    if (message.cacheReadTokens !== 0n) {
      obj.cacheReadTokens = message.cacheReadTokens.toString();
    }
    if (message.cacheWriteTokens !== 0n) {
      obj.cacheWriteTokens = message.cacheWriteTokens.toString();
    }
    if (message.providerRequestId !== "") {
      obj.providerRequestId = message.providerRequestId;
    }
    if (message.reasoningTokens !== 0n) {
      obj.reasoningTokens = message.reasoningTokens.toString();
    }
    if (message.purpose !== "") {
      obj.purpose = message.purpose;
    }
    return obj;
  },
  create(base) {
    return UsageReported.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseUsageReported();
    message.inputTokens = object.inputTokens !== void 0 && object.inputTokens !== null ? BigInt(object.inputTokens) : 0n;
    message.outputTokens = object.outputTokens !== void 0 && object.outputTokens !== null ? BigInt(object.outputTokens) : 0n;
    message.cacheReadTokens = object.cacheReadTokens !== void 0 && object.cacheReadTokens !== null ? BigInt(object.cacheReadTokens) : 0n;
    message.cacheWriteTokens = object.cacheWriteTokens !== void 0 && object.cacheWriteTokens !== null ? BigInt(object.cacheWriteTokens) : 0n;
    message.providerRequestId = object.providerRequestId ?? "";
    message.reasoningTokens = object.reasoningTokens !== void 0 && object.reasoningTokens !== null ? BigInt(object.reasoningTokens) : 0n;
    message.purpose = object.purpose ?? "";
    return message;
  }
};
function createBaseProviderRetry() {
  return { reason: "", attempt: 0, maxAttempts: 0, delayMs: 0n, continuesText: false };
}
var ProviderRetry = {
  encode(message, writer = new BinaryWriter()) {
    if (message.reason !== "") {
      writer.uint32(10).string(message.reason);
    }
    if (message.attempt !== 0) {
      writer.uint32(16).uint32(message.attempt);
    }
    if (message.maxAttempts !== 0) {
      writer.uint32(24).uint32(message.maxAttempts);
    }
    if (message.delayMs !== 0n) {
      if (BigInt.asUintN(64, message.delayMs) !== message.delayMs) {
        throw new globalThis.Error("value provided for field message.delayMs of type uint64 too large");
      }
      writer.uint32(32).uint64(message.delayMs);
    }
    if (message.continuesText !== false) {
      writer.uint32(40).bool(message.continuesText);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseProviderRetry();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.reason = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 16) {
              break;
            }
            message.attempt = reader.uint32();
            continue;
          }
          case 3: {
            if (tag !== 24) {
              break;
            }
            message.maxAttempts = reader.uint32();
            continue;
          }
          case 4: {
            if (tag !== 32) {
              break;
            }
            message.delayMs = reader.uint64();
            continue;
          }
          case 5: {
            if (tag !== 40) {
              break;
            }
            message.continuesText = reader.bool();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      reason: isSet2(object.reason) ? globalThis.String(object.reason) : "",
      attempt: isSet2(object.attempt) ? globalThis.Number(object.attempt) : 0,
      maxAttempts: isSet2(object.maxAttempts) ? globalThis.Number(object.maxAttempts) : isSet2(object.max_attempts) ? globalThis.Number(object.max_attempts) : 0,
      delayMs: isSet2(object.delayMs) ? BigInt(object.delayMs) : isSet2(object.delay_ms) ? BigInt(object.delay_ms) : 0n,
      continuesText: isSet2(object.continuesText) ? globalThis.Boolean(object.continuesText) : isSet2(object.continues_text) ? globalThis.Boolean(object.continues_text) : false
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.reason !== "") {
      obj.reason = message.reason;
    }
    if (message.attempt !== 0) {
      obj.attempt = Math.round(message.attempt);
    }
    if (message.maxAttempts !== 0) {
      obj.maxAttempts = Math.round(message.maxAttempts);
    }
    if (message.delayMs !== 0n) {
      obj.delayMs = message.delayMs.toString();
    }
    if (message.continuesText !== false) {
      obj.continuesText = message.continuesText;
    }
    return obj;
  },
  create(base) {
    return ProviderRetry.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseProviderRetry();
    message.reason = object.reason ?? "";
    message.attempt = object.attempt ?? 0;
    message.maxAttempts = object.maxAttempts ?? 0;
    message.delayMs = object.delayMs !== void 0 && object.delayMs !== null ? BigInt(object.delayMs) : 0n;
    message.continuesText = object.continuesText ?? false;
    return message;
  }
};
function createBaseProviderCompaction() {
  return { trigger: "", tokensBefore: 0n, tokensAfter: 0n, clearedResults: 0, summarizedMessages: 0 };
}
var ProviderCompaction = {
  encode(message, writer = new BinaryWriter()) {
    if (message.trigger !== "") {
      writer.uint32(10).string(message.trigger);
    }
    if (message.tokensBefore !== 0n) {
      if (BigInt.asUintN(64, message.tokensBefore) !== message.tokensBefore) {
        throw new globalThis.Error("value provided for field message.tokensBefore of type uint64 too large");
      }
      writer.uint32(16).uint64(message.tokensBefore);
    }
    if (message.tokensAfter !== 0n) {
      if (BigInt.asUintN(64, message.tokensAfter) !== message.tokensAfter) {
        throw new globalThis.Error("value provided for field message.tokensAfter of type uint64 too large");
      }
      writer.uint32(24).uint64(message.tokensAfter);
    }
    if (message.clearedResults !== 0) {
      writer.uint32(32).uint32(message.clearedResults);
    }
    if (message.summarizedMessages !== 0) {
      writer.uint32(40).uint32(message.summarizedMessages);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseProviderCompaction();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.trigger = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 16) {
              break;
            }
            message.tokensBefore = reader.uint64();
            continue;
          }
          case 3: {
            if (tag !== 24) {
              break;
            }
            message.tokensAfter = reader.uint64();
            continue;
          }
          case 4: {
            if (tag !== 32) {
              break;
            }
            message.clearedResults = reader.uint32();
            continue;
          }
          case 5: {
            if (tag !== 40) {
              break;
            }
            message.summarizedMessages = reader.uint32();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      trigger: isSet2(object.trigger) ? globalThis.String(object.trigger) : "",
      tokensBefore: isSet2(object.tokensBefore) ? BigInt(object.tokensBefore) : isSet2(object.tokens_before) ? BigInt(object.tokens_before) : 0n,
      tokensAfter: isSet2(object.tokensAfter) ? BigInt(object.tokensAfter) : isSet2(object.tokens_after) ? BigInt(object.tokens_after) : 0n,
      clearedResults: isSet2(object.clearedResults) ? globalThis.Number(object.clearedResults) : isSet2(object.cleared_results) ? globalThis.Number(object.cleared_results) : 0,
      summarizedMessages: isSet2(object.summarizedMessages) ? globalThis.Number(object.summarizedMessages) : isSet2(object.summarized_messages) ? globalThis.Number(object.summarized_messages) : 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.trigger !== "") {
      obj.trigger = message.trigger;
    }
    if (message.tokensBefore !== 0n) {
      obj.tokensBefore = message.tokensBefore.toString();
    }
    if (message.tokensAfter !== 0n) {
      obj.tokensAfter = message.tokensAfter.toString();
    }
    if (message.clearedResults !== 0) {
      obj.clearedResults = Math.round(message.clearedResults);
    }
    if (message.summarizedMessages !== 0) {
      obj.summarizedMessages = Math.round(message.summarizedMessages);
    }
    return obj;
  },
  create(base) {
    return ProviderCompaction.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseProviderCompaction();
    message.trigger = object.trigger ?? "";
    message.tokensBefore = object.tokensBefore !== void 0 && object.tokensBefore !== null ? BigInt(object.tokensBefore) : 0n;
    message.tokensAfter = object.tokensAfter !== void 0 && object.tokensAfter !== null ? BigInt(object.tokensAfter) : 0n;
    message.clearedResults = object.clearedResults ?? 0;
    message.summarizedMessages = object.summarizedMessages ?? 0;
    return message;
  }
};
function createBaseAgentHostHelloRequest() {
  return { protocolMajor: 0, protocolMinor: 0, engineBuildId: "", nonce: new Uint8Array(0) };
}
var AgentHostHelloRequest = {
  encode(message, writer = new BinaryWriter()) {
    if (message.protocolMajor !== 0) {
      writer.uint32(8).uint32(message.protocolMajor);
    }
    if (message.protocolMinor !== 0) {
      writer.uint32(16).uint32(message.protocolMinor);
    }
    if (message.engineBuildId !== "") {
      writer.uint32(26).string(message.engineBuildId);
    }
    if (message.nonce.length !== 0) {
      writer.uint32(34).bytes(message.nonce);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseAgentHostHelloRequest();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 8) {
              break;
            }
            message.protocolMajor = reader.uint32();
            continue;
          }
          case 2: {
            if (tag !== 16) {
              break;
            }
            message.protocolMinor = reader.uint32();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.engineBuildId = reader.string();
            continue;
          }
          case 4: {
            if (tag !== 34) {
              break;
            }
            message.nonce = reader.bytes();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      protocolMajor: isSet2(object.protocolMajor) ? globalThis.Number(object.protocolMajor) : isSet2(object.protocol_major) ? globalThis.Number(object.protocol_major) : 0,
      protocolMinor: isSet2(object.protocolMinor) ? globalThis.Number(object.protocolMinor) : isSet2(object.protocol_minor) ? globalThis.Number(object.protocol_minor) : 0,
      engineBuildId: isSet2(object.engineBuildId) ? globalThis.String(object.engineBuildId) : isSet2(object.engine_build_id) ? globalThis.String(object.engine_build_id) : "",
      nonce: isSet2(object.nonce) ? bytesFromBase64(object.nonce) : new Uint8Array(0)
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.protocolMajor !== 0) {
      obj.protocolMajor = Math.round(message.protocolMajor);
    }
    if (message.protocolMinor !== 0) {
      obj.protocolMinor = Math.round(message.protocolMinor);
    }
    if (message.engineBuildId !== "") {
      obj.engineBuildId = message.engineBuildId;
    }
    if (message.nonce.length !== 0) {
      obj.nonce = base64FromBytes(message.nonce);
    }
    return obj;
  },
  create(base) {
    return AgentHostHelloRequest.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseAgentHostHelloRequest();
    message.protocolMajor = object.protocolMajor ?? 0;
    message.protocolMinor = object.protocolMinor ?? 0;
    message.engineBuildId = object.engineBuildId ?? "";
    message.nonce = object.nonce ?? new Uint8Array(0);
    return message;
  }
};
function createBaseAgentHostHelloResponse() {
  return { protocolMajor: 0, protocolMinor: 0, hostBuildId: "", providerKinds: [], nonce: new Uint8Array(0) };
}
var AgentHostHelloResponse = {
  encode(message, writer = new BinaryWriter()) {
    if (message.protocolMajor !== 0) {
      writer.uint32(8).uint32(message.protocolMajor);
    }
    if (message.protocolMinor !== 0) {
      writer.uint32(16).uint32(message.protocolMinor);
    }
    if (message.hostBuildId !== "") {
      writer.uint32(26).string(message.hostBuildId);
    }
    for (const v of message.providerKinds) {
      writer.uint32(34).string(v);
    }
    if (message.nonce.length !== 0) {
      writer.uint32(42).bytes(message.nonce);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseAgentHostHelloResponse();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 8) {
              break;
            }
            message.protocolMajor = reader.uint32();
            continue;
          }
          case 2: {
            if (tag !== 16) {
              break;
            }
            message.protocolMinor = reader.uint32();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.hostBuildId = reader.string();
            continue;
          }
          case 4: {
            if (tag !== 34) {
              break;
            }
            message.providerKinds.push(reader.string());
            continue;
          }
          case 5: {
            if (tag !== 42) {
              break;
            }
            message.nonce = reader.bytes();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      protocolMajor: isSet2(object.protocolMajor) ? globalThis.Number(object.protocolMajor) : isSet2(object.protocol_major) ? globalThis.Number(object.protocol_major) : 0,
      protocolMinor: isSet2(object.protocolMinor) ? globalThis.Number(object.protocolMinor) : isSet2(object.protocol_minor) ? globalThis.Number(object.protocol_minor) : 0,
      hostBuildId: isSet2(object.hostBuildId) ? globalThis.String(object.hostBuildId) : isSet2(object.host_build_id) ? globalThis.String(object.host_build_id) : "",
      providerKinds: globalThis.Array.isArray(object?.providerKinds) ? object.providerKinds.map((e) => globalThis.String(e)) : globalThis.Array.isArray(object?.provider_kinds) ? object.provider_kinds.map((e) => globalThis.String(e)) : [],
      nonce: isSet2(object.nonce) ? bytesFromBase64(object.nonce) : new Uint8Array(0)
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.protocolMajor !== 0) {
      obj.protocolMajor = Math.round(message.protocolMajor);
    }
    if (message.protocolMinor !== 0) {
      obj.protocolMinor = Math.round(message.protocolMinor);
    }
    if (message.hostBuildId !== "") {
      obj.hostBuildId = message.hostBuildId;
    }
    if (message.providerKinds?.length) {
      obj.providerKinds = message.providerKinds;
    }
    if (message.nonce.length !== 0) {
      obj.nonce = base64FromBytes(message.nonce);
    }
    return obj;
  },
  create(base) {
    return AgentHostHelloResponse.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseAgentHostHelloResponse();
    message.protocolMajor = object.protocolMajor ?? 0;
    message.protocolMinor = object.protocolMinor ?? 0;
    message.hostBuildId = object.hostBuildId ?? "";
    message.providerKinds = object.providerKinds?.map((e) => e) || [];
    message.nonce = object.nonce ?? new Uint8Array(0);
    return message;
  }
};
function createBaseProviderProfileRef() {
  return { profileId: "", providerKind: "", modelId: "", credentialDeliveryTicket: "" };
}
var ProviderProfileRef = {
  encode(message, writer = new BinaryWriter()) {
    if (message.profileId !== "") {
      writer.uint32(10).string(message.profileId);
    }
    if (message.providerKind !== "") {
      writer.uint32(18).string(message.providerKind);
    }
    if (message.modelId !== "") {
      writer.uint32(26).string(message.modelId);
    }
    if (message.credentialDeliveryTicket !== "") {
      writer.uint32(34).string(message.credentialDeliveryTicket);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseProviderProfileRef();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.profileId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.providerKind = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.modelId = reader.string();
            continue;
          }
          case 4: {
            if (tag !== 34) {
              break;
            }
            message.credentialDeliveryTicket = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      profileId: isSet2(object.profileId) ? globalThis.String(object.profileId) : isSet2(object.profile_id) ? globalThis.String(object.profile_id) : "",
      providerKind: isSet2(object.providerKind) ? globalThis.String(object.providerKind) : isSet2(object.provider_kind) ? globalThis.String(object.provider_kind) : "",
      modelId: isSet2(object.modelId) ? globalThis.String(object.modelId) : isSet2(object.model_id) ? globalThis.String(object.model_id) : "",
      credentialDeliveryTicket: isSet2(object.credentialDeliveryTicket) ? globalThis.String(object.credentialDeliveryTicket) : isSet2(object.credential_delivery_ticket) ? globalThis.String(object.credential_delivery_ticket) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.profileId !== "") {
      obj.profileId = message.profileId;
    }
    if (message.providerKind !== "") {
      obj.providerKind = message.providerKind;
    }
    if (message.modelId !== "") {
      obj.modelId = message.modelId;
    }
    if (message.credentialDeliveryTicket !== "") {
      obj.credentialDeliveryTicket = message.credentialDeliveryTicket;
    }
    return obj;
  },
  create(base) {
    return ProviderProfileRef.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseProviderProfileRef();
    message.profileId = object.profileId ?? "";
    message.providerKind = object.providerKind ?? "";
    message.modelId = object.modelId ?? "";
    message.credentialDeliveryTicket = object.credentialDeliveryTicket ?? "";
    return message;
  }
};
function createBaseStructuredOutputContract() {
  return { schemaId: "", canonicalJsonSchema: new Uint8Array(0), strict: false };
}
var StructuredOutputContract = {
  encode(message, writer = new BinaryWriter()) {
    if (message.schemaId !== "") {
      writer.uint32(10).string(message.schemaId);
    }
    if (message.canonicalJsonSchema.length !== 0) {
      writer.uint32(18).bytes(message.canonicalJsonSchema);
    }
    if (message.strict !== false) {
      writer.uint32(24).bool(message.strict);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseStructuredOutputContract();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.schemaId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.canonicalJsonSchema = reader.bytes();
            continue;
          }
          case 3: {
            if (tag !== 24) {
              break;
            }
            message.strict = reader.bool();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      schemaId: isSet2(object.schemaId) ? globalThis.String(object.schemaId) : isSet2(object.schema_id) ? globalThis.String(object.schema_id) : "",
      canonicalJsonSchema: isSet2(object.canonicalJsonSchema) ? bytesFromBase64(object.canonicalJsonSchema) : isSet2(object.canonical_json_schema) ? bytesFromBase64(object.canonical_json_schema) : new Uint8Array(0),
      strict: isSet2(object.strict) ? globalThis.Boolean(object.strict) : false
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.schemaId !== "") {
      obj.schemaId = message.schemaId;
    }
    if (message.canonicalJsonSchema.length !== 0) {
      obj.canonicalJsonSchema = base64FromBytes(message.canonicalJsonSchema);
    }
    if (message.strict !== false) {
      obj.strict = message.strict;
    }
    return obj;
  },
  create(base) {
    return StructuredOutputContract.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseStructuredOutputContract();
    message.schemaId = object.schemaId ?? "";
    message.canonicalJsonSchema = object.canonicalJsonSchema ?? new Uint8Array(0);
    message.strict = object.strict ?? false;
    return message;
  }
};
function createBaseRunModelTurnRequest() {
  return {
    runId: "",
    turnId: "",
    provider: void 0,
    context: [],
    tools: [],
    promptCacheKey: "",
    structuredOutput: void 0,
    reasoningEffort: ""
  };
}
var RunModelTurnRequest = {
  encode(message, writer = new BinaryWriter()) {
    if (message.runId !== "") {
      writer.uint32(10).string(message.runId);
    }
    if (message.turnId !== "") {
      writer.uint32(18).string(message.turnId);
    }
    if (message.provider !== void 0) {
      ProviderProfileRef.encode(message.provider, writer.uint32(26).fork()).join();
    }
    for (const v of message.context) {
      AgentMessage.encode(v, writer.uint32(34).fork()).join();
    }
    for (const v of message.tools) {
      ToolDescriptor.encode(v, writer.uint32(42).fork()).join();
    }
    if (message.promptCacheKey !== "") {
      writer.uint32(50).string(message.promptCacheKey);
    }
    if (message.structuredOutput !== void 0) {
      StructuredOutputContract.encode(message.structuredOutput, writer.uint32(58).fork()).join();
    }
    if (message.reasoningEffort !== "") {
      writer.uint32(66).string(message.reasoningEffort);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseRunModelTurnRequest();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.runId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.turnId = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.provider = ProviderProfileRef.decode(reader, reader.uint32());
            continue;
          }
          case 4: {
            if (tag !== 34) {
              break;
            }
            message.context.push(AgentMessage.decode(reader, reader.uint32()));
            continue;
          }
          case 5: {
            if (tag !== 42) {
              break;
            }
            message.tools.push(ToolDescriptor.decode(reader, reader.uint32()));
            continue;
          }
          case 6: {
            if (tag !== 50) {
              break;
            }
            message.promptCacheKey = reader.string();
            continue;
          }
          case 7: {
            if (tag !== 58) {
              break;
            }
            message.structuredOutput = StructuredOutputContract.decode(reader, reader.uint32());
            continue;
          }
          case 8: {
            if (tag !== 66) {
              break;
            }
            message.reasoningEffort = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      runId: isSet2(object.runId) ? globalThis.String(object.runId) : isSet2(object.run_id) ? globalThis.String(object.run_id) : "",
      turnId: isSet2(object.turnId) ? globalThis.String(object.turnId) : isSet2(object.turn_id) ? globalThis.String(object.turn_id) : "",
      provider: isSet2(object.provider) ? ProviderProfileRef.fromJSON(object.provider) : void 0,
      context: globalThis.Array.isArray(object?.context) ? object.context.map((e) => AgentMessage.fromJSON(e)) : [],
      tools: globalThis.Array.isArray(object?.tools) ? object.tools.map((e) => ToolDescriptor.fromJSON(e)) : [],
      promptCacheKey: isSet2(object.promptCacheKey) ? globalThis.String(object.promptCacheKey) : isSet2(object.prompt_cache_key) ? globalThis.String(object.prompt_cache_key) : "",
      structuredOutput: isSet2(object.structuredOutput) ? StructuredOutputContract.fromJSON(object.structuredOutput) : isSet2(object.structured_output) ? StructuredOutputContract.fromJSON(object.structured_output) : void 0,
      reasoningEffort: isSet2(object.reasoningEffort) ? globalThis.String(object.reasoningEffort) : isSet2(object.reasoning_effort) ? globalThis.String(object.reasoning_effort) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.runId !== "") {
      obj.runId = message.runId;
    }
    if (message.turnId !== "") {
      obj.turnId = message.turnId;
    }
    if (message.provider !== void 0) {
      obj.provider = ProviderProfileRef.toJSON(message.provider);
    }
    if (message.context?.length) {
      obj.context = message.context.map((e) => AgentMessage.toJSON(e));
    }
    if (message.tools?.length) {
      obj.tools = message.tools.map((e) => ToolDescriptor.toJSON(e));
    }
    if (message.promptCacheKey !== "") {
      obj.promptCacheKey = message.promptCacheKey;
    }
    if (message.structuredOutput !== void 0) {
      obj.structuredOutput = StructuredOutputContract.toJSON(message.structuredOutput);
    }
    if (message.reasoningEffort !== "") {
      obj.reasoningEffort = message.reasoningEffort;
    }
    return obj;
  },
  create(base) {
    return RunModelTurnRequest.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseRunModelTurnRequest();
    message.runId = object.runId ?? "";
    message.turnId = object.turnId ?? "";
    message.provider = object.provider !== void 0 && object.provider !== null ? ProviderProfileRef.fromPartial(object.provider) : void 0;
    message.context = object.context?.map((e) => AgentMessage.fromPartial(e)) || [];
    message.tools = object.tools?.map((e) => ToolDescriptor.fromPartial(e)) || [];
    message.promptCacheKey = object.promptCacheKey ?? "";
    message.structuredOutput = object.structuredOutput !== void 0 && object.structuredOutput !== null ? StructuredOutputContract.fromPartial(object.structuredOutput) : void 0;
    message.reasoningEffort = object.reasoningEffort ?? "";
    return message;
  }
};
function createBaseProviderFinish() {
  return { reasonCode: "", providerResponseId: "" };
}
var ProviderFinish = {
  encode(message, writer = new BinaryWriter()) {
    if (message.reasonCode !== "") {
      writer.uint32(10).string(message.reasonCode);
    }
    if (message.providerResponseId !== "") {
      writer.uint32(18).string(message.providerResponseId);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseProviderFinish();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.reasonCode = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.providerResponseId = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      reasonCode: isSet2(object.reasonCode) ? globalThis.String(object.reasonCode) : isSet2(object.reason_code) ? globalThis.String(object.reason_code) : "",
      providerResponseId: isSet2(object.providerResponseId) ? globalThis.String(object.providerResponseId) : isSet2(object.provider_response_id) ? globalThis.String(object.provider_response_id) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.reasonCode !== "") {
      obj.reasonCode = message.reasonCode;
    }
    if (message.providerResponseId !== "") {
      obj.providerResponseId = message.providerResponseId;
    }
    return obj;
  },
  create(base) {
    return ProviderFinish.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseProviderFinish();
    message.reasonCode = object.reasonCode ?? "";
    message.providerResponseId = object.providerResponseId ?? "";
    return message;
  }
};
function createBaseProviderFailure() {
  return { error: void 0, contextMayBeResumable: false };
}
var ProviderFailure = {
  encode(message, writer = new BinaryWriter()) {
    if (message.error !== void 0) {
      AlphaError.encode(message.error, writer.uint32(10).fork()).join();
    }
    if (message.contextMayBeResumable !== false) {
      writer.uint32(16).bool(message.contextMayBeResumable);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseProviderFailure();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.error = AlphaError.decode(reader, reader.uint32());
            continue;
          }
          case 2: {
            if (tag !== 16) {
              break;
            }
            message.contextMayBeResumable = reader.bool();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      error: isSet2(object.error) ? AlphaError.fromJSON(object.error) : void 0,
      contextMayBeResumable: isSet2(object.contextMayBeResumable) ? globalThis.Boolean(object.contextMayBeResumable) : isSet2(object.context_may_be_resumable) ? globalThis.Boolean(object.context_may_be_resumable) : false
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.error !== void 0) {
      obj.error = AlphaError.toJSON(message.error);
    }
    if (message.contextMayBeResumable !== false) {
      obj.contextMayBeResumable = message.contextMayBeResumable;
    }
    return obj;
  },
  create(base) {
    return ProviderFailure.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseProviderFailure();
    message.error = object.error !== void 0 && object.error !== null ? AlphaError.fromPartial(object.error) : void 0;
    message.contextMayBeResumable = object.contextMayBeResumable ?? false;
    return message;
  }
};
function createBaseProviderEvent() {
  return {
    runId: "",
    turnId: "",
    eventSeq: 0n,
    textDelta: void 0,
    reasoningDelta: void 0,
    toolCall: void 0,
    usage: void 0,
    finish: void 0,
    failure: void 0,
    retry: void 0,
    compaction: void 0
  };
}
var ProviderEvent = {
  encode(message, writer = new BinaryWriter()) {
    if (message.runId !== "") {
      writer.uint32(10).string(message.runId);
    }
    if (message.turnId !== "") {
      writer.uint32(18).string(message.turnId);
    }
    if (message.eventSeq !== 0n) {
      if (BigInt.asUintN(64, message.eventSeq) !== message.eventSeq) {
        throw new globalThis.Error("value provided for field message.eventSeq of type uint64 too large");
      }
      writer.uint32(24).uint64(message.eventSeq);
    }
    if (message.textDelta !== void 0) {
      TextDelta.encode(message.textDelta, writer.uint32(82).fork()).join();
    }
    if (message.reasoningDelta !== void 0) {
      ReasoningDelta.encode(message.reasoningDelta, writer.uint32(90).fork()).join();
    }
    if (message.toolCall !== void 0) {
      ToolCallRequested.encode(message.toolCall, writer.uint32(98).fork()).join();
    }
    if (message.usage !== void 0) {
      UsageReported.encode(message.usage, writer.uint32(106).fork()).join();
    }
    if (message.finish !== void 0) {
      ProviderFinish.encode(message.finish, writer.uint32(114).fork()).join();
    }
    if (message.failure !== void 0) {
      ProviderFailure.encode(message.failure, writer.uint32(122).fork()).join();
    }
    if (message.retry !== void 0) {
      ProviderRetry.encode(message.retry, writer.uint32(130).fork()).join();
    }
    if (message.compaction !== void 0) {
      ProviderCompaction.encode(message.compaction, writer.uint32(138).fork()).join();
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseProviderEvent();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.runId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.turnId = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 24) {
              break;
            }
            message.eventSeq = reader.uint64();
            continue;
          }
          case 10: {
            if (tag !== 82) {
              break;
            }
            message.textDelta = TextDelta.decode(reader, reader.uint32());
            continue;
          }
          case 11: {
            if (tag !== 90) {
              break;
            }
            message.reasoningDelta = ReasoningDelta.decode(reader, reader.uint32());
            continue;
          }
          case 12: {
            if (tag !== 98) {
              break;
            }
            message.toolCall = ToolCallRequested.decode(reader, reader.uint32());
            continue;
          }
          case 13: {
            if (tag !== 106) {
              break;
            }
            message.usage = UsageReported.decode(reader, reader.uint32());
            continue;
          }
          case 14: {
            if (tag !== 114) {
              break;
            }
            message.finish = ProviderFinish.decode(reader, reader.uint32());
            continue;
          }
          case 15: {
            if (tag !== 122) {
              break;
            }
            message.failure = ProviderFailure.decode(reader, reader.uint32());
            continue;
          }
          case 16: {
            if (tag !== 130) {
              break;
            }
            message.retry = ProviderRetry.decode(reader, reader.uint32());
            continue;
          }
          case 17: {
            if (tag !== 138) {
              break;
            }
            message.compaction = ProviderCompaction.decode(reader, reader.uint32());
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      runId: isSet2(object.runId) ? globalThis.String(object.runId) : isSet2(object.run_id) ? globalThis.String(object.run_id) : "",
      turnId: isSet2(object.turnId) ? globalThis.String(object.turnId) : isSet2(object.turn_id) ? globalThis.String(object.turn_id) : "",
      eventSeq: isSet2(object.eventSeq) ? BigInt(object.eventSeq) : isSet2(object.event_seq) ? BigInt(object.event_seq) : 0n,
      textDelta: isSet2(object.textDelta) ? TextDelta.fromJSON(object.textDelta) : isSet2(object.text_delta) ? TextDelta.fromJSON(object.text_delta) : void 0,
      reasoningDelta: isSet2(object.reasoningDelta) ? ReasoningDelta.fromJSON(object.reasoningDelta) : isSet2(object.reasoning_delta) ? ReasoningDelta.fromJSON(object.reasoning_delta) : void 0,
      toolCall: isSet2(object.toolCall) ? ToolCallRequested.fromJSON(object.toolCall) : isSet2(object.tool_call) ? ToolCallRequested.fromJSON(object.tool_call) : void 0,
      usage: isSet2(object.usage) ? UsageReported.fromJSON(object.usage) : void 0,
      finish: isSet2(object.finish) ? ProviderFinish.fromJSON(object.finish) : void 0,
      failure: isSet2(object.failure) ? ProviderFailure.fromJSON(object.failure) : void 0,
      retry: isSet2(object.retry) ? ProviderRetry.fromJSON(object.retry) : void 0,
      compaction: isSet2(object.compaction) ? ProviderCompaction.fromJSON(object.compaction) : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.runId !== "") {
      obj.runId = message.runId;
    }
    if (message.turnId !== "") {
      obj.turnId = message.turnId;
    }
    if (message.eventSeq !== 0n) {
      obj.eventSeq = message.eventSeq.toString();
    }
    if (message.textDelta !== void 0) {
      obj.textDelta = TextDelta.toJSON(message.textDelta);
    }
    if (message.reasoningDelta !== void 0) {
      obj.reasoningDelta = ReasoningDelta.toJSON(message.reasoningDelta);
    }
    if (message.toolCall !== void 0) {
      obj.toolCall = ToolCallRequested.toJSON(message.toolCall);
    }
    if (message.usage !== void 0) {
      obj.usage = UsageReported.toJSON(message.usage);
    }
    if (message.finish !== void 0) {
      obj.finish = ProviderFinish.toJSON(message.finish);
    }
    if (message.failure !== void 0) {
      obj.failure = ProviderFailure.toJSON(message.failure);
    }
    if (message.retry !== void 0) {
      obj.retry = ProviderRetry.toJSON(message.retry);
    }
    if (message.compaction !== void 0) {
      obj.compaction = ProviderCompaction.toJSON(message.compaction);
    }
    return obj;
  },
  create(base) {
    return ProviderEvent.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseProviderEvent();
    message.runId = object.runId ?? "";
    message.turnId = object.turnId ?? "";
    message.eventSeq = object.eventSeq !== void 0 && object.eventSeq !== null ? BigInt(object.eventSeq) : 0n;
    message.textDelta = object.textDelta !== void 0 && object.textDelta !== null ? TextDelta.fromPartial(object.textDelta) : void 0;
    message.reasoningDelta = object.reasoningDelta !== void 0 && object.reasoningDelta !== null ? ReasoningDelta.fromPartial(object.reasoningDelta) : void 0;
    message.toolCall = object.toolCall !== void 0 && object.toolCall !== null ? ToolCallRequested.fromPartial(object.toolCall) : void 0;
    message.usage = object.usage !== void 0 && object.usage !== null ? UsageReported.fromPartial(object.usage) : void 0;
    message.finish = object.finish !== void 0 && object.finish !== null ? ProviderFinish.fromPartial(object.finish) : void 0;
    message.failure = object.failure !== void 0 && object.failure !== null ? ProviderFailure.fromPartial(object.failure) : void 0;
    message.retry = object.retry !== void 0 && object.retry !== null ? ProviderRetry.fromPartial(object.retry) : void 0;
    message.compaction = object.compaction !== void 0 && object.compaction !== null ? ProviderCompaction.fromPartial(object.compaction) : void 0;
    return message;
  }
};
function createBaseCancelModelTurnRequest() {
  return { runId: "", turnId: "", reasonCode: "" };
}
var CancelModelTurnRequest = {
  encode(message, writer = new BinaryWriter()) {
    if (message.runId !== "") {
      writer.uint32(10).string(message.runId);
    }
    if (message.turnId !== "") {
      writer.uint32(18).string(message.turnId);
    }
    if (message.reasonCode !== "") {
      writer.uint32(26).string(message.reasonCode);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseCancelModelTurnRequest();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.runId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.turnId = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.reasonCode = reader.string();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      runId: isSet2(object.runId) ? globalThis.String(object.runId) : isSet2(object.run_id) ? globalThis.String(object.run_id) : "",
      turnId: isSet2(object.turnId) ? globalThis.String(object.turnId) : isSet2(object.turn_id) ? globalThis.String(object.turn_id) : "",
      reasonCode: isSet2(object.reasonCode) ? globalThis.String(object.reasonCode) : isSet2(object.reason_code) ? globalThis.String(object.reason_code) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.runId !== "") {
      obj.runId = message.runId;
    }
    if (message.turnId !== "") {
      obj.turnId = message.turnId;
    }
    if (message.reasonCode !== "") {
      obj.reasonCode = message.reasonCode;
    }
    return obj;
  },
  create(base) {
    return CancelModelTurnRequest.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseCancelModelTurnRequest();
    message.runId = object.runId ?? "";
    message.turnId = object.turnId ?? "";
    message.reasonCode = object.reasonCode ?? "";
    return message;
  }
};
function createBaseCancelModelTurnResponse() {
  return { cancellationRequested: false };
}
var CancelModelTurnResponse = {
  encode(message, writer = new BinaryWriter()) {
    if (message.cancellationRequested !== false) {
      writer.uint32(8).bool(message.cancellationRequested);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseCancelModelTurnResponse();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 8) {
              break;
            }
            message.cancellationRequested = reader.bool();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      cancellationRequested: isSet2(object.cancellationRequested) ? globalThis.Boolean(object.cancellationRequested) : isSet2(object.cancellation_requested) ? globalThis.Boolean(object.cancellation_requested) : false
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.cancellationRequested !== false) {
      obj.cancellationRequested = message.cancellationRequested;
    }
    return obj;
  },
  create(base) {
    return CancelModelTurnResponse.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseCancelModelTurnResponse();
    message.cancellationRequested = object.cancellationRequested ?? false;
    return message;
  }
};
function createBaseSubmitToolResultsRequest() {
  return { runId: "", turnId: "", results: [] };
}
var SubmitToolResultsRequest = {
  encode(message, writer = new BinaryWriter()) {
    if (message.runId !== "") {
      writer.uint32(10).string(message.runId);
    }
    if (message.turnId !== "") {
      writer.uint32(18).string(message.turnId);
    }
    for (const v of message.results) {
      ToolCallCompleted.encode(v, writer.uint32(26).fork()).join();
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseSubmitToolResultsRequest();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 10) {
              break;
            }
            message.runId = reader.string();
            continue;
          }
          case 2: {
            if (tag !== 18) {
              break;
            }
            message.turnId = reader.string();
            continue;
          }
          case 3: {
            if (tag !== 26) {
              break;
            }
            message.results.push(ToolCallCompleted.decode(reader, reader.uint32()));
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return {
      runId: isSet2(object.runId) ? globalThis.String(object.runId) : isSet2(object.run_id) ? globalThis.String(object.run_id) : "",
      turnId: isSet2(object.turnId) ? globalThis.String(object.turnId) : isSet2(object.turn_id) ? globalThis.String(object.turn_id) : "",
      results: globalThis.Array.isArray(object?.results) ? object.results.map((e) => ToolCallCompleted.fromJSON(e)) : []
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.runId !== "") {
      obj.runId = message.runId;
    }
    if (message.turnId !== "") {
      obj.turnId = message.turnId;
    }
    if (message.results?.length) {
      obj.results = message.results.map((e) => ToolCallCompleted.toJSON(e));
    }
    return obj;
  },
  create(base) {
    return SubmitToolResultsRequest.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseSubmitToolResultsRequest();
    message.runId = object.runId ?? "";
    message.turnId = object.turnId ?? "";
    message.results = object.results?.map((e) => ToolCallCompleted.fromPartial(e)) || [];
    return message;
  }
};
function createBaseSubmitToolResultsResponse() {
  return { accepted: false };
}
var SubmitToolResultsResponse = {
  encode(message, writer = new BinaryWriter()) {
    if (message.accepted !== false) {
      writer.uint32(8).bool(message.accepted);
    }
    return writer;
  },
  decode(input, length) {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const previousRecursionDepth = reader.__tsProtoDecodeDepth ?? 0;
    if (previousRecursionDepth >= 100) {
      throw new globalThis.Error("protobuf decode recursion limit exceeded");
    }
    reader.__tsProtoDecodeDepth = previousRecursionDepth + 1;
    try {
      const end = length === void 0 ? reader.len : reader.pos + length;
      const message = createBaseSubmitToolResultsResponse();
      while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (tag !== 8) {
              break;
            }
            message.accepted = reader.bool();
            continue;
          }
        }
        if ((tag & 7) === 4 || tag === 0) {
          break;
        }
        reader.skip(tag & 7);
      }
      return message;
    } finally {
      reader.__tsProtoDecodeDepth = previousRecursionDepth;
    }
  },
  fromJSON(object) {
    return { accepted: isSet2(object.accepted) ? globalThis.Boolean(object.accepted) : false };
  },
  toJSON(message) {
    const obj = {};
    if (message.accepted !== false) {
      obj.accepted = message.accepted;
    }
    return obj;
  },
  create(base) {
    return SubmitToolResultsResponse.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseSubmitToolResultsResponse();
    message.accepted = object.accepted ?? false;
    return message;
  }
};
function bytesFromBase64(b64) {
  const bin = globalThis.atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; ++i) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}
function base64FromBytes(arr) {
  const bin = [];
  arr.forEach((byte) => {
    bin.push(globalThis.String.fromCharCode(byte));
  });
  return globalThis.btoa(bin.join(""));
}
function isSet2(value) {
  return value !== null && value !== void 0;
}

// src/provider/canonical-json.ts
function encodeCanonicalJson(value) {
  return Buffer.from(stringifyCanonicalJson(value), "utf8");
}
function stringifyCanonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("CANONICAL_JSON_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stringifyCanonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record3 = value;
    const entries = Object.keys(record3).sort().filter((key) => record3[key] !== void 0).map((key) => `${JSON.stringify(key)}:${stringifyCanonicalJson(record3[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError("CANONICAL_JSON_UNSUPPORTED_VALUE");
}

// src/provider/errors.ts
var ProviderHostError = class extends Error {
  code;
  retryable;
  constructor(code, retryable = false) {
    super(code);
    this.name = "ProviderHostError";
    this.code = code;
    this.retryable = retryable;
  }
};
var TurnCanceledError = class extends ProviderHostError {
  constructor() {
    super("AGENT_TURN_CANCELED", false);
    this.name = "TurnCanceledError";
  }
};

// src/provider/fixture-provider.ts
var FixtureProvider = class {
  kind = "fixture";
  async *runTurn(context) {
    const { request, signal } = context;
    if (request.provider?.providerKind !== this.kind) {
      throw new ProviderHostError("AGENT_PROVIDER_KIND_MISMATCH");
    }
    const prompt = latestUserText(request);
    const messageId = `fixture:${request.runId}:${request.turnId}:assistant`;
    const providerRequestId = `fixture:${request.runId}:${request.turnId}`;
    yield { kind: "reasoningDelta", value: { delta: "fixture:plan" } };
    await checkpoint(signal);
    let outputText;
    const tool = request.tools[0];
    if (tool) {
      const toolCallId = `fixture:${request.runId}:${request.turnId}:tool:1`;
      yield {
        kind: "toolCall",
        value: {
          toolCallId,
          toolName: tool.toolName,
          arguments: {
            schemaId: tool.inputSchemaId,
            canonicalJson: encodeCanonicalJson({ input: prompt })
          }
        }
      };
      const results = await context.waitForToolResults(toolCallId);
      throwIfCanceled(signal);
      outputText = summarizeToolResults(results);
    } else {
      outputText = prompt.length === 0 ? "fixture:empty" : `fixture:${prompt}`;
    }
    const splitAt = Math.max(1, Math.floor(outputText.length / 2));
    for (const delta of [outputText.slice(0, splitAt), outputText.slice(splitAt)].filter(Boolean)) {
      throwIfCanceled(signal);
      yield { kind: "textDelta", value: { messageId, delta } };
      await checkpoint(signal);
    }
    yield {
      kind: "usage",
      value: {
        inputTokens: BigInt(countFixtureTokens(prompt)),
        outputTokens: BigInt(countFixtureTokens(outputText)),
        cacheReadTokens: 0n,
        cacheWriteTokens: 0n,
        reasoningTokens: 0n,
        purpose: "",
        providerRequestId
      }
    };
    yield {
      kind: "finish",
      value: { reasonCode: "stop", providerResponseId: providerRequestId }
    };
  }
};
function latestUserText(request) {
  for (let index = request.context.length - 1; index >= 0; index -= 1) {
    const message = request.context[index];
    if (message.role !== 1 /* AGENT_ROLE_USER */) continue;
    return message.parts.map((part) => part.text ?? "").filter(Boolean).join("\n");
  }
  return "";
}
function summarizeToolResults(results) {
  const failed = results.filter((result) => result.error !== void 0).length;
  return `fixture:tool-results:${results.length}:errors:${failed}`;
}
function countFixtureTokens(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/u).length;
}
async function checkpoint(signal) {
  try {
    await (0, import_promises.setImmediate)(void 0, { signal });
  } catch (error) {
    if (signal.aborted) throw new TurnCanceledError();
    throw error;
  }
}
function throwIfCanceled(signal) {
  if (signal.aborted) throw new TurnCanceledError();
}

// src/provider/http-provider.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// src/provider/tool-copy.ts
var CORE_TOOLS = [
  "wechat.chat.list_sessions",
  "wechat.chat.resolve_session",
  "wechat.contacts.resolve_contact",
  "wechat.chat.get_messages",
  "wechat.chat.get_message_around",
  "alpha.messages.search_page",
  "wechat.chat.get_daily_message_counts",
  "wechat.analytics.get_chat_report",
  "wechat.analytics.get_account_report",
  "alpha.media.view_chat_images"
];
var TOOL_DESCRIPTIONS = {
  "wechat.chat.list_sessions": "\u5217\u51FA\u4F1A\u8BDD\uFF0C\u6700\u8FD1\u6709\u6D88\u606F\u7684\u5728\u524D\uFF1Bquery \u6309\u540D\u79F0\u8FC7\u6EE4\u3002\u7528\u6765\u627E\u4F1A\u8BDD ID\uFF08username\uFF09\u6216\u770B\u6700\u8FD1\u548C\u8C01\u804A\u8FC7\u3002",
  "wechat.chat.resolve_session": "\u6309\u5907\u6CE8\u3001\u6635\u79F0\u3001\u7FA4\u540D\u7B49\u7EBF\u7D22\u627E\u5230\u4F1A\u8BDD\uFF0C\u8FD4\u56DE\u5019\u9009\u548C\u4F1A\u8BDD ID\uFF08username\uFF09\u3002",
  "wechat.contacts.resolve_contact": "\u6309\u540D\u79F0\u7EBF\u7D22\u627E\u5230\u8054\u7CFB\u4EBA\u3001\u7FA4\u6216\u516C\u4F17\u53F7\uFF0C\u8FD4\u56DE\u5019\u9009\u548C username\u3002",
  "wechat.chat.get_messages": '\u6309\u65F6\u95F4\u987A\u5E8F\u8BFB\u53D6\u4E00\u4E2A\u4F1A\u8BDD\u7684\u6D88\u606F\u3002\u9ED8\u8BA4\u4ECE\u6700\u65E9\u7684\u6D88\u606F\u5F00\u59CB\uFF08order=asc\uFF09\uFF1B\u8981\u770B\u6700\u8FD1\u7684\u6D88\u606F\u4F20 order="desc"\uFF0C\u7ED3\u679C\u4ECD\u9700\u6309\u65F6\u95F4\u7406\u89E3\u3002\u7528\u8FD4\u56DE\u7684 nextCursor \u7EE7\u7EED\u7FFB\u9875\uFF0C\u6216\u7528 offset\u3002',
  "wechat.chat.get_message_around": "\u8BFB\u53D6\u67D0\u6761\u6D88\u606F\uFF08anchor_id \u4E3A\u6D88\u606F id\uFF09\u524D\u540E\u5404\u82E5\u5E72\u6761\uFF0C\u7528\u6765\u7406\u89E3\u4E00\u53E5\u8BDD\u7684\u4E0A\u4E0B\u6587\u3002",
  "wechat.chat.get_daily_message_counts": "\u67D0\u4E2A\u4F1A\u8BDD\u67D0\u4E2A\u6708\u6BCF\u5929\u7684\u6D88\u606F\u6761\u6570\uFF08\u53EA\u6570\u6761\u6570\u3001\u4E0D\u8BFB\u6B63\u6587\uFF0C\u5F88\u5FEB\uFF09\u3002\u8981\u770B\u4E00\u6BB5\u65F6\u95F4\u7684\u6D3B\u8DC3\u8D8B\u52BF\uFF0C\u6309\u6708\u9010\u4E2A\u8C03\u7528\uFF1B\u8981\u6574\u4F53\u7EDF\u8BA1\u8BF7\u7528 wechat_analytics_get_chat_report\u3002",
  "wechat.analytics.get_chat_report": "\u4E00\u4E2A\u4F1A\u8BDD\u7684\u7EDF\u8BA1\u62A5\u544A\uFF0C\u7531\u5F15\u64CE\u6309\u6D88\u606F\u6761\u6570\u76F4\u63A5\u8BA1\u7B97\uFF0C\u4E0D\u9700\u8981\u5148\u8BFB\u6D88\u606F\uFF1A\u7FA4\u804A\u7ED9\u51FA\u603B\u91CF\u3001\u53D1\u8A00\u6392\u884C\u3001\u6D3B\u8DC3\u65F6\u6BB5\u3001\u8FDE\u7EED\u5929\u6570\uFF1B\u79C1\u804A\u7ED9\u51FA\u53CC\u65B9\u7684\u53D1\u8A00\u5360\u6BD4\u3001\u8C01\u5148\u5F00\u53E3\u3001\u56DE\u590D\u901F\u5EA6\u3001\u5E38\u7528\u8BCD\u3001\u6700\u65E9\u7684\u6D88\u606F\u3002\u95EE\u201C\u804A\u4E86\u591A\u5C11\u3001\u4EC0\u4E48\u65F6\u5019\u6700\u6D3B\u8DC3\u3001\u8C01\u8BDD\u591A\u3001\u8FD1\u4E00\u5E74/\u67D0\u4E2A\u6708\u7684\u60C5\u51B5\u201D\u5148\u7528\u5B83\uFF0C\u518D\u6309\u9700\u8BFB\u539F\u6587\u3002year/month \u6216 start_date/end_date \u9650\u5B9A\u8303\u56F4\uFF08\u8FD1\u4E00\u5E74\u5C31\u4F20\u8D77\u6B62\u65E5\u671F\uFF09\uFF0C\u4E0D\u4F20\u5219\u7EDF\u8BA1\u5168\u90E8\u5386\u53F2\u3002\u82E5\u8FD4\u56DE status=running\uFF0C\u53EA\u5E26 analysis_id \u518D\u8C03\u7528\u4E00\u6B21\u7EE7\u7EED\u7B49\u5F85\u3002",
  "wechat.analytics.get_account_report": "\u6574\u4E2A\u8D26\u53F7\u7684\u7EDF\u8BA1\uFF0C\u7531\u5F15\u64CE\u76F4\u63A5\u8BA1\u7B97\uFF1Areport=private_chats \u662F\u6240\u6709\u79C1\u804A\u7684\u603B\u89C8\uFF08\u603B\u91CF\u3001\u6700\u5FD9\u7684\u65E5\u5B50\u548C\u65F6\u6BB5\u3001\u804A\u5F97\u6700\u591A\u7684\u4EBA\uFF09\uFF0Cannual \u662F\u5E74\u5EA6\u62A5\u544A\uFF08\u4F20 year\uFF09\uFF0Cmentions \u662F\u7FA4\u91CC @\u6211 \u7684\u6D88\u606F\u3002\u8303\u56F4\u53C2\u6570\u540C get_chat_report\uFF1Bstatus=running \u65F6\u53EA\u5E26 analysis_id \u518D\u8C03\u7528\u3002",
  "alpha.messages.search_page": "\u5728\u804A\u5929\u8BB0\u5F55\u91CC\u505A\u5168\u6587\u641C\u7D22\uFF08\u5FAE\u4FE1\u81EA\u5E26\u7D22\u5F15\uFF09\uFF0C\u53EF\u6309\u4F1A\u8BDD\u3001\u53D1\u9001\u4EBA\u548C\u65F6\u95F4\u8303\u56F4\uFF08Unix \u6BEB\u79D2\u5B57\u7B26\u4E32\uFF09\u8FC7\u6EE4\uFF1Bgroup_by_conversation=true \u65F6\u6309\u4F1A\u8BDD\u7EDF\u8BA1\u547D\u4E2D\u3002account_id \u7528\u7CFB\u7EDF\u63D0\u793A\u91CC\u7ED9\u51FA\u7684\u5F53\u524D\u8D26\u53F7\u3002"
};
var TOOL_HINTS = {
  "wechat.core.list_accounts": "\u672C\u673A\u7684\u5FAE\u4FE1\u8D26\u53F7",
  "wechat.contacts.list_contacts": "\u6D4F\u89C8\u3001\u7B5B\u9009\u901A\u8BAF\u5F55",
  "wechat.contacts.get_group_members": "\u7FA4\u6210\u5458\u540D\u5355",
  "wechat.contacts.get_contact_profile": "\u8054\u7CFB\u4EBA\u6216\u7FA4\u7684\u8BE6\u7EC6\u8D44\u6599\uFF08\u5730\u533A\u3001\u7B7E\u540D\u3001\u6807\u7B7E\u3001\u6765\u6E90\u3001\u5171\u540C\u7FA4\u3001\u7FA4\u4E3B\u3001\u7FA4\u516C\u544A\u7B49\uFF09",
  "wechat.favorites.list_items": "\u6536\u85CF",
  "wechat.chat.list_search_senders": "\u67D0\u4E2A\u5173\u952E\u8BCD\u5404\u53D1\u9001\u4EBA\u7684\u547D\u4E2D\u6570",
  "wechat.chat.get_message_anchor": "\u6309\u65F6\u95F4\u5B9A\u4F4D\u4F1A\u8BDD\u91CC\u7684\u6D88\u606F\u4F4D\u7F6E",
  "wechat.moments.list_timeline": "\u670B\u53CB\u5708\u65F6\u95F4\u7EBF\uFF08\u53EF\u6309\u4EBA\u3001\u65F6\u95F4\u7B5B\u9009\uFF09",
  "wechat.moments.list_users": "\u53D1\u8FC7\u670B\u53CB\u5708\u7684\u4EBA",
  "wechat.biz.list_accounts": "\u516C\u4F17\u53F7\u3001\u670D\u52A1\u53F7\u5217\u8868",
  "wechat.biz.get_messages": "\u516C\u4F17\u53F7\u63A8\u9001\u7684\u6D88\u606F",
  "alpha.messages.resolve_search_hit": "\u8BFB\u51FA\u4E00\u6761\u641C\u7D22\u547D\u4E2D\u7684\u539F\u6D88\u606F",
  "alpha.exports.start": "\u628A\u4E00\u4E2A\u4F1A\u8BDD\u5BFC\u51FA\u6210\u6587\u4EF6\uFF08\u4F1A\u5199\u5165\u672C\u5730\uFF0C\u53EF\u80FD\u9700\u8981\u7528\u6237\u6279\u51C6\uFF09"
};
var FALLBACK_HINT_CHARS = 60;
function toolHint(name, description) {
  const known = TOOL_HINTS[name];
  if (known) return known;
  const first = description.split(/(?<=[。.!?！？])\s*/)[0]?.trim() || description.trim();
  return first.length > FALLBACK_HINT_CHARS ? `${first.slice(0, FALLBACK_HINT_CHARS)}\u2026` : first || "\u5176\u4ED6\u80FD\u529B";
}

// src/provider/http-tool-catalog.ts
var MAX_SCHEMA_BYTES = 64 * 1024;
var WIRE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
function bindHttpTools(descriptors) {
  if (descriptors.length > 128) throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_LIMIT");
  const originalNames = /* @__PURE__ */ new Set();
  const reserved = /* @__PURE__ */ new Set();
  for (const descriptor of descriptors) {
    const name = descriptor.toolName;
    if (typeof name !== "string" || !name || name.trim() !== name || Buffer.byteLength(name, "utf8") > 256 || originalNames.has(name)) {
      throw new ProviderHostError("AGENT_PROVIDER_TOOL_DESCRIPTOR_INVALID");
    }
    originalNames.add(name);
    if (WIRE_NAME.test(name)) reserved.add(name);
  }
  let alias = 0;
  const tools = descriptors.map((descriptor) => {
    let wireName = descriptor.toolName;
    if (!WIRE_NAME.test(wireName)) {
      wireName = readableAlias(descriptor.toolName);
      if (!WIRE_NAME.test(wireName) || reserved.has(wireName)) {
        do {
          wireName = `alpha_tool_${alias++}`;
        } while (reserved.has(wireName));
      }
      reserved.add(wireName);
    }
    const declared = descriptor.description ?? "";
    if (typeof declared !== "string" || Buffer.byteLength(declared, "utf8") > 4096) {
      throw new ProviderHostError("AGENT_PROVIDER_TOOL_DESCRIPTOR_INVALID");
    }
    const description = TOOL_DESCRIPTIONS[descriptor.toolName] ?? declared;
    return {
      originalName: descriptor.toolName,
      inputSchemaId: descriptor.inputSchemaId,
      wireName,
      description,
      schema: decodeSchema(descriptor.inputJsonSchema)
    };
  });
  return { tools, byWireName: new Map(tools.map((tool) => [tool.wireName, tool])) };
}
function readableAlias(name) {
  const alias = name.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return /^[A-Za-z_]/.test(alias) ? alias.slice(0, 64) : `tool_${alias}`.slice(0, 64);
}
function decodeSchema(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new ProviderHostError("AGENT_PROVIDER_TOOL_SCHEMA_INVALID");
  }
  if (bytes.byteLength > MAX_SCHEMA_BYTES) throw new ProviderHostError("AGENT_PROVIDER_TOOL_SCHEMA_TOO_LARGE");
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ProviderHostError("AGENT_PROVIDER_TOOL_SCHEMA_INVALID");
  }
  if (!record(value) || value.type !== "object" || value.properties !== void 0 && !record(value.properties) || value.required !== void 0 && (!Array.isArray(value.required) || value.required.some((item) => typeof item !== "string") || new Set(value.required).size !== value.required.length)) {
    throw new ProviderHostError("AGENT_PROVIDER_TOOL_SCHEMA_INVALID");
  }
  return value;
}
function record(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

// src/provider/context-budget.ts
var IMAGE_TOKENS = 1600;
function contextBudget(profile) {
  const window = profile.contextWindow;
  const reserve = Math.min(profile.maxOutputTokens ?? 8192, Math.floor(window * 0.25), 32e3);
  const safety = Math.max(1024, Math.floor(window * 0.05));
  const input = Math.max(2048, window - reserve - safety);
  return {
    input,
    toolResult: clamp(Math.floor(input * 0.2), 2e3, 24e3),
    pruneAbove: Math.floor(input * 0.75),
    pruneTo: Math.floor(input * 0.5),
    summaryTokens: clamp(Math.floor(input * 0.05), 1024, 4096)
  };
}
function estimateTokens(text) {
  let ascii = 0;
  let other = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 127) ascii += 1;
    else if (code < 55296 || code > 56319) other += 1;
  }
  return Math.ceil(ascii / 4) + other;
}
var ARRAY_DEPTH = 3;
var NOTE = "\u7ED3\u679C\u8FC7\u957F\uFF0C\u53EA\u4FDD\u7559\u4E86\u524D\u4E00\u90E8\u5206\u3002\u9700\u8981\u66F4\u591A\u65F6\u7F29\u5C0F\u65F6\u95F4\u8303\u56F4\u3001\u52A0\u4E0A\u5173\u952E\u8BCD\uFF0C\u6216\u7528\u8FD4\u56DE\u7684 cursor / offset \u7FFB\u9875\u3002";
var noteFor = (resultId) => resultId ? `${NOTE}\u5B8C\u6574\u7ED3\u679C\u5DF2\u4FDD\u5B58\u4E3A ${resultId}\uFF1A\u7528 read_result \u4F20 result_id \u4E0E offset \u7EE7\u7EED\u8BFB\uFF0C\u6216\u4F20 query \u5728\u5176\u4E2D\u641C\u7D22\u3002` : NOTE;
function fitToolResult(value, maxTokens, resultId) {
  const text = JSON.stringify(value) ?? "null";
  if (estimateTokens(text) <= maxTokens) return { value, truncated: false };
  const path = longestArray(value, [], 0);
  if (path) {
    const list = read(value, path);
    let low = 0;
    let high = list.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (estimateTokens(JSON.stringify(withList(value, path, list.slice(0, middle), list.length, resultId))) <= maxTokens) low = middle;
      else high = middle - 1;
    }
    const fitted = withList(value, path, list.slice(0, low), list.length, resultId);
    if (low > 0 && estimateTokens(JSON.stringify(fitted)) <= maxTokens) return { value: fitted, truncated: true };
  }
  return { value: clipText(text, maxTokens, `
\u2026[${noteFor(resultId)}]\u2026
`), truncated: true };
}
function longestArray(value, path, depth) {
  if (depth > ARRAY_DEPTH || !value || typeof value !== "object") return null;
  if (Array.isArray(value)) return value.length > 1 ? path : null;
  let best = null;
  let bestSize = -1;
  for (const [key, child] of Object.entries(value)) {
    const candidate = Array.isArray(child) ? child.length > 1 ? [...path, key] : null : longestArray(child, [...path, key], depth + 1);
    if (!candidate) continue;
    const size = (JSON.stringify(read(value, candidate.slice(path.length))) ?? "").length;
    if (size > bestSize) {
      best = candidate;
      bestSize = size;
    }
  }
  return best;
}
function read(value, path) {
  let current = value;
  for (const key of path) current = current?.[key];
  return current;
}
function withList(value, path, kept, total, resultId) {
  const marker = { kept: kept.length, total, field: path.join(".") || "(root)", ...resultId ? { result_id: resultId } : {}, note: noteFor(resultId) };
  if (path.length === 0) return { items: kept, _alpha_truncated: marker };
  const clone = structuredClone(value);
  let parent = clone;
  for (const key of path.slice(0, -1)) parent = parent[key];
  parent[path.at(-1)] = kept;
  return { ...clone, _alpha_truncated: marker };
}
function clipText(text, maxTokens, note = `
\u2026[${NOTE}]\u2026
`) {
  if (estimateTokens(text) <= maxTokens) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (estimateTokens(join(text, middle, note)) <= maxTokens) low = middle;
    else high = middle - 1;
  }
  return join(text, low, note);
}
function join(text, keep, note) {
  const head = Math.ceil(keep * 0.7);
  return `${text.slice(0, head)}${note}${keep - head > 0 ? text.slice(text.length - (keep - head)) : ""}`;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
var CLEARED_RESULT = "[\u8F83\u65E9\u7684\u5DE5\u5177\u7ED3\u679C\u5DF2\u4ECE\u4E0A\u4E0B\u6587\u4E2D\u6E05\u7406\u4EE5\u8282\u7701\u7A7A\u95F4\uFF1B\u5982\u4ECD\u9700\u8981\uFF0C\u8BF7\u91CD\u65B0\u8C03\u7528\u8BE5\u5DE5\u5177\u3002]";
function pruneToolResults(slots, latestRound, estimate, target) {
  let cleared = 0;
  for (const slot of [...slots].sort((left, right) => left.round - right.round)) {
    if (estimate() <= target) break;
    if (slot.cleared || slot.round >= latestRound) continue;
    slot.clear();
    slot.cleared = true;
    cleared += 1;
  }
  return cleared;
}
function isContextOverflow(status, body) {
  if (status !== 400 && status !== 413 && status !== 422) return false;
  return /context[_\s-]?(?:window|length|limit|size)|maximum context|too many tokens|token limit|prompt (?:is )?too long|input (?:is )?too long|context_length_exceeded|超过.{0,8}(?:上下文|token)|上下文.{0,8}(?:超限|过长|超过)/i.test(body);
}

// src/provider/result-store.ts
var READ_RESULT = "read_result";
var MAX_ENTRIES = 32;
var MAX_TOTAL_CHARS = 16 * 1024 * 1024;
var DEFAULT_READ_CHARS = 6e3;
var MAX_READ_CHARS = 16e3;
var MAX_MATCHES = 8;
var MATCH_CONTEXT = 200;
var ResultStore = class {
  entries = /* @__PURE__ */ new Map();
  total = 0;
  next = 1;
  get size() {
    return this.entries.size;
  }
  /** Keeps `text` and returns the id it can be read back by. */
  save(text) {
    const id = `r${this.next++}`;
    this.entries.set(id, { id, text });
    this.total += text.length;
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= 1 || this.entries.size <= MAX_ENTRIES && this.total <= MAX_TOTAL_CHARS) break;
      this.entries.delete(key);
      this.total -= entry.text.length;
    }
    return id;
  }
  /** Answers a `read_result` call. */
  read(argumentsValue) {
    const args = argumentsValue && typeof argumentsValue === "object" && !Array.isArray(argumentsValue) ? argumentsValue : {};
    const id = typeof args.result_id === "string" ? args.result_id.trim() : "";
    const entry = this.entries.get(id);
    if (!entry) {
      return { error: "unknown_result", note: "\u6CA1\u6709\u8FD9\u4E2A result_id\uFF08\u6216\u5B83\u5DF2\u88AB\u6E05\u7406\uFF09\u3002\u8BF7\u53EA\u4F7F\u7528\u5DE5\u5177\u7ED3\u679C\u91CC _alpha_truncated.result_id \u7ED9\u51FA\u7684\u7F16\u53F7\uFF0C\u6216\u91CD\u65B0\u8C03\u7528\u539F\u5DE5\u5177\u3002" };
    }
    const query = typeof args.query === "string" ? args.query.trim().slice(0, 200) : "";
    if (query) return this.search(entry, query);
    const total = entry.text.length;
    const offset = clampInt(args.offset, 0, total, 0);
    const limit = clampInt(args.limit, 1, MAX_READ_CHARS, DEFAULT_READ_CHARS);
    const end = Math.min(total, offset + limit);
    return {
      result_id: id,
      offset,
      returned: end - offset,
      total_chars: total,
      next_offset: end < total ? end : null,
      text: entry.text.slice(offset, end)
    };
  }
  search(entry, query) {
    const haystack = entry.text.toLowerCase();
    const needle = query.toLowerCase();
    const matches = [];
    let from = 0;
    while (matches.length < MAX_MATCHES) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      matches.push({ at, text: entry.text.slice(Math.max(0, at - MATCH_CONTEXT), at + needle.length + MATCH_CONTEXT) });
      from = at + needle.length + MATCH_CONTEXT;
    }
    return {
      result_id: entry.id,
      query,
      total_chars: entry.text.length,
      matches,
      ...matches.length === 0 ? { note: "\u7ED3\u679C\u91CC\u6CA1\u6709\u51FA\u73B0\u8FD9\u4E2A\u8BCD\uFF1B\u6362\u4E00\u4E2A\u5173\u952E\u8BCD\uFF0C\u6216\u4E0D\u5E26 query \u6309 offset \u8BFB\u53D6\u3002" } : {}
    };
  }
};
function clampInt(value, min, max, fallback) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}
function readResultTool() {
  return {
    originalName: READ_RESULT,
    inputSchemaId: "alpha.agent.read_result.input.v1",
    wireName: READ_RESULT,
    description: "\u8BFB\u53D6\u88AB\u622A\u65AD\u7684\u5DE5\u5177\u7ED3\u679C\u7684\u5B8C\u6574\u5185\u5BB9\u3002\u5DE5\u5177\u7ED3\u679C\u91CC\u51FA\u73B0 _alpha_truncated \u65F6\u4F1A\u5E26\u4E00\u4E2A result_id\uFF1A\u4F20 offset \u548C limit \u6309\u5B57\u7B26\u7EE7\u7EED\u5F80\u540E\u8BFB\uFF08\u8FD4\u56DE\u91CC\u6709 next_offset\uFF09\uFF0C\u6216\u4F20 query \u5728\u5B8C\u6574\u7ED3\u679C\u91CC\u641C\u7D22\u5173\u952E\u8BCD\u3002\u53EA\u8BFB\u53D6\u9700\u8981\u7684\u90E8\u5206\u3002",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["result_id"],
      properties: {
        result_id: { type: "string", description: "\u88AB\u622A\u65AD\u7ED3\u679C\u7684\u7F16\u53F7\uFF0C\u4F8B\u5982 r1" },
        offset: { type: "integer", minimum: 0, description: "\u4ECE\u7B2C\u51E0\u4E2A\u5B57\u7B26\u5F00\u59CB\u8BFB\uFF0C\u9ED8\u8BA4 0" },
        limit: { type: "integer", minimum: 1, maximum: MAX_READ_CHARS, description: `\u6700\u591A\u8BFB\u591A\u5C11\u5B57\u7B26\uFF0C\u9ED8\u8BA4 ${DEFAULT_READ_CHARS}` },
        query: { type: "string", description: "\u5728\u5B8C\u6574\u7ED3\u679C\u91CC\u641C\u7D22\u7684\u5173\u952E\u8BCD\uFF1B\u7ED9\u4E86\u5B83\u5C31\u53EA\u8FD4\u56DE\u547D\u4E2D\u7247\u6BB5" }
      }
    }
  };
}

// src/provider/media-parts.ts
var USER_IMAGE_SCHEMA = "alpha.agent.image.v1";
var MEDIA_KEY = "_alpha_media";
var MIME = /^image\/(?:jpeg|png|gif|webp)$/;
var BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
var MAX_ITEM_CHARS = 8 * 1024 * 1024;
var IMAGE_OMITTED = "[\u56FE\u7247\u672A\u53D1\u9001\uFF1A\u5F53\u524D\u6A21\u578B\u6CA1\u6709\u5F00\u542F\u56FE\u7247\u8F93\u5165\uFF0C\u53EF\u5728 \u8BBE\u7F6E \u2192 AI \u2192 \u6A21\u578B \u91CC\u4E3A\u5B83\u5F00\u542F\u3002]";
function userImage(part) {
  if (part.data?.schemaId !== USER_IMAGE_SCHEMA) return null;
  let value;
  try {
    value = JSON.parse(Buffer.from(part.data.canonicalJson).toString("utf8"));
  } catch {
    return null;
  }
  return mediaItem(value);
}
function mediaItem(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record3 = value;
  const mimeType = record3.mime_type;
  const data = record3.data;
  if (typeof mimeType !== "string" || !MIME.test(mimeType) || typeof data !== "string" || !data || data.length > MAX_ITEM_CHARS || !BASE64.test(data)) return null;
  return { mimeType, data };
}
function takeToolMedia(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !(MEDIA_KEY in value)) return { value, media: [] };
  const { [MEDIA_KEY]: raw, ...rest } = value;
  const media = Array.isArray(raw) ? raw.map(mediaItem).filter((item) => item !== null) : [];
  return { value: rest, media };
}
var dataUrl = (item) => `data:${item.mimeType};base64,${item.data}`;
var anthropicImage = (item) => ({ type: "image", source: { type: "base64", media_type: item.mimeType, data: item.data } });
var openAIImage = (item) => ({ type: "image_url", image_url: { url: dataUrl(item) } });
var responsesImage = (item) => ({ type: "input_image", image_url: dataUrl(item) });
var geminiImage = (item) => ({ inlineData: { mimeType: item.mimeType, data: item.data } });
function toolMediaIntro(count2) {
  return `\u4EE5\u4E0B\u662F\u5DE5\u5177\u521A\u8FD4\u56DE\u7684 ${count2} \u5F20\u56FE\u7247\uFF08\u6309\u5DE5\u5177\u7ED3\u679C\u91CC\u7684 index \u987A\u5E8F\uFF09\u3002\u53EA\u6839\u636E\u53EF\u89C1\u753B\u9762\u5224\u65AD\uFF0C\u770B\u4E0D\u6E05\u65F6\u76F4\u63A5\u8BF4\u660E\u3002`;
}

// src/provider/conversation.ts
var MAX_RESULT_BYTES = 12 * 1024 * 1024;
var CLEARED_IMAGE = "[\u56FE\u7247\u5DF2\u4ECE\u4E0A\u4E0B\u6587\u4E2D\u6E05\u7406]";
var RUNTIME_CONTEXT_OPEN = "<runtime-context>";
function isRuntimeContext(message) {
  return messageText(message).trimStart().startsWith(RUNTIME_CONTEXT_OPEN);
}
function withRuntimeContext(turns, blocks) {
  const last = turns.at(-1);
  if (blocks.length === 0 || !last || last.role !== 1) return turns;
  return [...turns.slice(0, -1), { ...last, parts: [...last.parts, ...blocks.map((text) => ({ text }))] }];
}
function createProviderConversation(kind, source, imageInput) {
  const system = source.filter((message) => message.role === 3 && !isRuntimeContext(message));
  const runtime = source.filter((message) => message.role === 3 && isRuntimeContext(message)).map(messageText).filter(Boolean);
  const turns = withRuntimeContext(source.filter((message) => message.role !== 3), runtime);
  const systemText = system.map(messageText).filter(Boolean).join("\n");
  const messages = turns.map((message) => toWire(kind, message, imageInput));
  if (kind === "openai-chat" && systemText) messages.unshift({ role: "system", content: systemText });
  let history = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index].role !== 2) {
      history = index;
      break;
    }
  }
  return { kind, messages, systemText, history, slots: [], round: 0, imageInput, store: new ResultStore() };
}
function textConversation(kind, systemText, userText) {
  const user = { messageId: "", role: 1, parts: [{ text: userText }], createdAtUnixMs: 0n };
  const messages = [toWire(kind, user, false)];
  if (kind === "openai-chat" && systemText) messages.unshift({ role: "system", content: systemText });
  return { kind, messages, systemText, history: 0, slots: [], round: 0, imageInput: false, store: new ResultStore() };
}
function toWire(kind, message, imageInput) {
  const text = messageText(message);
  const assistant = message.role === 2;
  const images = assistant ? [] : message.parts.map(userImage).filter((item) => item !== null);
  const shown = imageInput ? images : [];
  const note = images.length && !imageInput ? IMAGE_OMITTED : "";
  const body = [text, note].filter(Boolean).join("\n");
  const words = body ? [body] : [];
  if (kind === "gemini") {
    return { role: assistant ? "model" : "user", parts: [...shown.map(geminiImage), ...words.map((value) => ({ text: value }))] };
  }
  if (kind === "anthropic") {
    return { role: assistant ? "assistant" : "user", content: shown.length ? [...shown.map(anthropicImage), ...words.map((value) => ({ type: "text", text: value }))] : body };
  }
  if (kind === "openai-responses") {
    return { role: assistant ? "assistant" : "user", content: shown.length ? [...words.map((value) => ({ type: "input_text", text: value })), ...shown.map(responsesImage)] : body };
  }
  return {
    role: message.role === 2 ? "assistant" : message.role === 4 ? "tool" : "user",
    content: shown.length ? [...words.map((value) => ({ type: "text", text: value })), ...shown.map(openAIImage)] : body
  };
}
function messageText(message) {
  return message.parts.map((part) => part.text ?? "").filter(Boolean).join("\n");
}
function dropOldestHistory(conversation) {
  if (conversation.history <= 0) return false;
  const start = conversation.kind === "openai-chat" && conversation.messages[0]?.role === "system" ? 1 : 0;
  let removed = 0;
  do {
    conversation.messages.splice(start, 1);
    removed += 1;
  } while (removed < conversation.history && !isUser(conversation.messages[start]));
  conversation.history -= removed;
  return true;
}
function historyEntries(conversation) {
  const start = historyStart(conversation);
  return conversation.messages.slice(start, start + conversation.history).map((message) => ({
    role: message.role === "assistant" || message.role === "model" ? "assistant" : "user",
    text: wireText(message)
  }));
}
function historyStart(conversation) {
  return conversation.kind === "openai-chat" && conversation.messages[0]?.role === "system" ? 1 : 0;
}
function wireText(message) {
  const content = message.content ?? message.parts;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => part && typeof part === "object" && typeof part.text === "string" ? part.text : "").filter(Boolean).join("\n");
}
function replaceHistory(conversation, count2, summary) {
  const start = historyStart(conversation);
  const note = { messageId: "", role: 1, parts: [{ text: summary }], createdAtUnixMs: 0n };
  const replaced = Math.min(count2, conversation.history);
  conversation.messages.splice(start, replaced, toWire(conversation.kind, note, false));
  conversation.history = conversation.history - replaced + 1;
}
function isUser(message) {
  return message?.role === "user";
}
function appendToolRound(conversation, turn, calls, results, maxResultTokens) {
  conversation.round += 1;
  const round = conversation.round;
  const byId = new Map(results.map((result) => [result.toolCallId, result]));
  const encoded = calls.map((call) => encodeToolResult(
    byId.get(call.toolCallId),
    maxResultTokens,
    conversation.imageInput,
    call.wireToolName === READ_RESULT ? void 0 : conversation.store
  ));
  const media = encoded.flatMap((entry) => entry.media);
  const { kind, messages } = conversation;
  if (kind === "anthropic") {
    const blocks = turn.assistantBlocks.length > 0 ? turn.assistantBlocks : calls.map((call) => ({ type: "tool_use", id: call.toolCallId, name: call.wireToolName, input: call.arguments }));
    messages.push({ role: "assistant", content: blocks });
    const content = calls.map((call, index) => {
      const entry = encoded[index];
      const block = {
        type: "tool_result",
        tool_use_id: call.toolCallId,
        content: entry.media.length ? [{ type: "text", text: entry.text }, ...entry.media.map(anthropicImage)] : entry.text,
        ...entry.isError ? { is_error: true } : {}
      };
      track(conversation, round, entry, () => {
        block.content = CLEARED_RESULT;
      });
      return block;
    });
    messages.push({ role: "user", content });
    return;
  }
  if (kind === "gemini") {
    const parts = turn.assistantParts.length > 0 ? turn.assistantParts : calls.map((call) => ({ functionCall: { name: call.wireToolName, args: call.arguments } }));
    messages.push({ role: "model", parts });
    const responses = calls.map((call, index) => {
      const entry = encoded[index];
      const part = {
        functionResponse: {
          name: call.wireToolName,
          response: geminiResponseValue(entry.value),
          ...call.providerCallId ? { id: call.toolCallId } : {}
        }
      };
      track(conversation, round, entry, () => {
        part.functionResponse.response = { cleared: CLEARED_RESULT };
      });
      return part;
    });
    const pictures = media.map(geminiImage);
    messages.push({ role: "user", parts: [...responses, ...pictures.length ? [{ text: toolMediaIntro(media.length) }, ...pictures] : []] });
    trackPictures(conversation, round, pictures, (picture) => {
      delete picture.inlineData;
      picture.text = CLEARED_IMAGE;
    });
    return;
  }
  if (kind === "openai-responses") {
    if (turn.assistantText) messages.push({ role: "assistant", content: turn.assistantText });
    for (const call of calls) {
      messages.push({ type: "function_call", call_id: call.toolCallId, name: call.wireToolName, arguments: call.argumentsJson });
    }
    calls.forEach((call, index) => {
      const item = { type: "function_call_output", call_id: call.toolCallId, output: encoded[index].text };
      track(conversation, round, encoded[index], () => {
        item.output = CLEARED_RESULT;
      });
      messages.push(item);
    });
    if (media.length) {
      const item = { role: "user", content: [{ type: "input_text", text: toolMediaIntro(media.length) }, ...media.map(responsesImage)] };
      messages.push(item);
      trackPictures(conversation, round, [item], (picture) => {
        picture.content = CLEARED_IMAGE;
      });
    }
    return;
  }
  messages.push({
    role: "assistant",
    content: turn.assistantText || null,
    ...turn.assistantReasoning ? { reasoning_content: turn.assistantReasoning } : {},
    tool_calls: calls.map((call) => ({ id: call.toolCallId, type: "function", function: { name: call.wireToolName, arguments: call.argumentsJson } }))
  });
  calls.forEach((call, index) => {
    const message = { role: "tool", tool_call_id: call.toolCallId, content: encoded[index].text };
    track(conversation, round, encoded[index], () => {
      message.content = CLEARED_RESULT;
    });
    messages.push(message);
  });
  if (media.length) {
    const message = { role: "user", content: [{ type: "text", text: toolMediaIntro(media.length) }, ...media.map(openAIImage)] };
    messages.push(message);
    trackPictures(conversation, round, [message], (picture) => {
      picture.content = CLEARED_IMAGE;
    });
  }
}
function track(conversation, round, entry, clear) {
  conversation.slots.push({ round, tokens: entry.tokens + entry.media.length * IMAGE_TOKENS, cleared: false, clear });
}
function trackPictures(conversation, round, pictures, clear) {
  for (const picture of pictures) {
    conversation.slots.push({ round, tokens: IMAGE_TOKENS, cleared: false, clear: () => clear(picture) });
  }
}
function encodeToolResult(result, maxTokens, imageInput, store) {
  if (result?.error !== void 0) {
    const value = { error: { code: result.error.code || "AGENT_TOOL_ERROR", retryable: result.error.retryable === true } };
    const text2 = stringifyCanonicalJson(value);
    return { value, text: text2, isError: true, media: [], tokens: estimateTokens(text2) };
  }
  let parsed = null;
  if (result?.result) {
    const bytes = result.result.canonicalJson;
    if (bytes.byteLength > MAX_RESULT_BYTES) throw new ProviderHostError("AGENT_PROVIDER_TOOL_RESULT_TOO_LARGE");
    try {
      parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
    } catch {
      throw new ProviderHostError("AGENT_PROVIDER_TOOL_RESULT_INVALID");
    }
  }
  const taken = takeToolMedia(parsed);
  const media = imageInput ? taken.media : [];
  const base = !imageInput && taken.media.length && taken.value && typeof taken.value === "object" ? { ...taken.value, note: IMAGE_OMITTED } : taken.value;
  let fitted = fitToolResult(base, maxTokens);
  if (fitted.truncated && store) {
    fitted = fitToolResult(base, maxTokens, store.save(typeof base === "string" ? base : stringifyCanonicalJson(base)));
  }
  const text = typeof fitted.value === "string" ? fitted.value : stringifyCanonicalJson(fitted.value);
  return { value: fitted.value, text, isError: false, media, tokens: estimateTokens(text) };
}
function geminiResponseValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return { value };
}
function estimatePayload(value) {
  let images = 0;
  const text = JSON.stringify(value, (key, item) => {
    if (typeof item === "string" && item.length > 1024 && (key === "data" || key === "url" || key === "image_url" || item.startsWith("data:image/"))) {
      images += 1;
      return "";
    }
    return item;
  });
  return estimateTokens(text ?? "") + images * IMAGE_TOKENS;
}

// src/provider/compaction.ts
var import_node_crypto = require("node:crypto");
var SUMMARY_OPEN = "<compacted-summary>";
var SUMMARY_CLOSE = "</compacted-summary>";
var CACHE_LIMIT = 24;
var ENTRY_TOKENS = 6e3;
var cache = /* @__PURE__ */ new Map();
function historyChain(entries) {
  const chain = [""];
  let state = "";
  for (const entry of entries) {
    state = (0, import_node_crypto.createHash)("sha256").update(state).update("\0").update(entry.role).update("\0").update(entry.text).digest("hex");
    chain.push(state);
  }
  return chain;
}
function cachedSummary(chain) {
  for (let covered = chain.length - 1; covered >= 1; covered -= 1) {
    const summary = cache.get(chain[covered]);
    if (summary) {
      cache.delete(chain[covered]);
      cache.set(chain[covered], summary);
      return { covered, summary };
    }
  }
  return null;
}
function rememberSummary(chain, covered, summary) {
  const key = chain[covered];
  if (!key) return;
  cache.delete(key);
  cache.set(key, summary);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}
var SUMMARY_SYSTEM = "\u4F60\u662F\u5BF9\u8BDD\u538B\u7F29\u5668\u3002\u4F60\u7684\u4EFB\u52A1\u662F\u628A\u4E00\u6BB5\u8F83\u65E9\u7684\u5BF9\u8BDD\u538B\u7F29\u6210\u4EA4\u63A5\u6458\u8981\uFF0C\u8BA9\u540C\u4E00\u4E2A\u52A9\u624B\u5728\u6CA1\u6709\u539F\u6587\u7684\u60C5\u51B5\u4E0B\u7EE7\u7EED\u5DE5\u4F5C\u3002\u53EA\u8F93\u51FA\u6458\u8981\u6B63\u6587\uFF1B\u4E0D\u8981\u5BD2\u6684\uFF0C\u4E0D\u8981\u63D0\u95EE\uFF0C\u4E0D\u8981\u8C03\u7528\u4EFB\u4F55\u5DE5\u5177\uFF0C\u4E0D\u8981\u7EED\u5199\u5BF9\u8BDD\u3002";
function summaryPrompt(entries, previous, maxTokens, inputTokens) {
  const lines = [];
  if (previous) lines.push(`\u66F4\u65E9\u7684\u6458\u8981\uFF08\u5DF2\u7ECF\u538B\u7F29\u8FC7\u7684\u90E8\u5206\uFF0C\u9700\u8981\u5408\u5E76\u8FDB\u65B0\u6458\u8981\uFF09\uFF1A
${previous}
`);
  lines.push("\u9700\u8981\u538B\u7F29\u7684\u5BF9\u8BDD\uFF08\u6309\u65F6\u95F4\u987A\u5E8F\uFF09\uFF1A");
  for (const entry of entries) {
    lines.push(`${entry.role === "user" ? "\u7528\u6237" : "\u52A9\u624B"}\uFF1A${clipText(entry.text, ENTRY_TOKENS)}`);
  }
  const transcript = clipText(lines.join("\n"), Math.max(1e3, inputTokens));
  return `${transcript}

\u8BF7\u6309\u4E0B\u9762\u7684\u5C0F\u8282\u5199\u51FA\u6458\u8981\uFF0C\u6CA1\u6709\u5185\u5BB9\u7684\u5C0F\u8282\u5199\u201C\u65E0\u201D\uFF0C\u603B\u957F\u5EA6\u4E0D\u8D85\u8FC7 ${Math.max(300, Math.floor(maxTokens * 0.75))} \u5B57\uFF1A
## \u7528\u6237\u7684\u76EE\u6807\u4E0E\u8981\u6C42
## \u5DF2\u786E\u5B9A\u7684\u7EA6\u5B9A\u548C\u504F\u597D
## \u5DF2\u5B8C\u6210\u7684\u5DE5\u4F5C\u4E0E\u7ED3\u8BBA\uFF08\u4FDD\u7559\u5173\u952E\u6570\u5B57\u3001\u4EBA\u540D/\u7FA4\u540D\u3001\u65F6\u95F4\u8303\u56F4\uFF09
## \u8FD8\u6CA1\u5B8C\u6210\u7684\u4E8B
## \u540E\u9762\u8FD8\u4F1A\u7528\u5230\u7684\u6807\u8BC6\uFF08\u8D26\u53F7 id\u3001\u4F1A\u8BDD username\u3001result_id\u3001\u6587\u4EF6\u8DEF\u5F84\u3001\u67E5\u8BE2 id\uFF09
\u53EA\u5199\u4E8B\u5B9E\uFF0C\u4E0D\u5199\u8BC4\u4EF7\uFF1B\u4E0D\u8981\u7F16\u9020\u539F\u6587\u91CC\u6CA1\u6709\u7684\u5185\u5BB9\u3002`;
}
function summaryMessage(summary) {
  return `${SUMMARY_OPEN}
\u8F83\u65E9\u7684\u5BF9\u8BDD\u5DF2\u538B\u7F29\u4E3A\u4E0B\u9762\u7684\u6458\u8981\u3002\u628A\u5B83\u5F53\u4F5C\u5DF2\u7ECF\u53D1\u751F\u8FC7\u7684\u80CC\u666F\uFF0C\u4E0D\u8981\u5411\u7528\u6237\u590D\u8FF0\u3002

${summary.trim()}
${SUMMARY_CLOSE}`;
}
function shrinks(summary, entries) {
  const original = entries.reduce((total, entry) => total + estimateTokens(entry.text), 0);
  return summary.trim().length > 0 && estimateTokens(summary) < original * 0.8;
}

// src/provider/model-profile.ts
var DEFAULT_CONTEXT_WINDOW = 32768;
var MIN_CONTEXT_WINDOW = 4096;
var MAX_CONTEXT_WINDOW = 1e7;
var LEVELS = ["none", "low", "medium", "high", "xhigh", "max"];
var DEFAULT_MODEL_PROFILE = { contextWindow: DEFAULT_CONTEXT_WINDOW, imageInput: false };
function modelProfileFromEnv(env = process.env) {
  const raw = env.ALPHA_AGENT_MODEL_PROFILE;
  if (!raw || raw.length > 4096) return DEFAULT_MODEL_PROFILE;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_MODEL_PROFILE;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_MODEL_PROFILE;
  const record3 = value;
  const window = integer(record3.contextWindow);
  const output = integer(record3.maxOutputTokens);
  const levels = Array.isArray(record3.reasoningLevels) ? LEVELS.filter((level) => record3.reasoningLevels.includes(level)) : void 0;
  const contextWindow = window && window >= MIN_CONTEXT_WINDOW ? Math.min(window, MAX_CONTEXT_WINDOW) : DEFAULT_CONTEXT_WINDOW;
  return {
    contextWindow,
    ...output && output >= 256 ? { maxOutputTokens: Math.min(output, contextWindow) } : {},
    imageInput: record3.imageInput === true,
    ...levels ? { reasoningLevels: levels } : {}
  };
}
function integer(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : void 0;
}
function supportedReasoningLevel(requested, profile) {
  if (!requested || !profile.reasoningLevels) return requested;
  if (requested === "none" && profile.reasoningLevels.includes("none")) return "none";
  const supported = profile.reasoningLevels.filter((level) => level !== "none");
  if (supported.length === 0) return "";
  if (requested !== "none" && supported.includes(requested)) return requested;
  const rank = LEVELS.indexOf(requested);
  const below = supported.filter((level) => LEVELS.indexOf(level) < rank);
  return below.at(-1) ?? supported[0];
}

// src/provider/retry.ts
var MAX_ATTEMPTS = 6;
var STALL_ATTEMPTS = 3;
var RATE_LIMIT_ATTEMPTS = 4;
var RATE_LIMIT_BASE_MS = 5e3;
var RATE_LIMIT_JITTER = 0.15;
var BASE_DELAY_MS = 500;
var MAX_DELAY_MS = 1e4;
var JITTER_RATIO = 0.1;
var MAX_RETRY_AFTER_MS = 6e4;
function statusRetryReason(status) {
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limit";
  if (status >= 500 && status <= 599) return "server";
  return null;
}
function isQuotaExhausted(body) {
  return /insufficient[_\s-]?(?:quota|balance|funds)|exceeded your current quota|billing|credit balance|out of credits?|余额不足|欠费|额度已用|账户.{0,6}(?:欠费|余额)/i.test(body);
}
function parseRetryAfter(value, now = Date.now()) {
  const text = value?.trim();
  if (!text) return void 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.round(Number(text) * 1e3);
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(0, at - now) : void 0;
}
function attemptLimit(reason) {
  return reason === "rate_limit" ? RATE_LIMIT_ATTEMPTS : reason === "timeout" ? STALL_ATTEMPTS : MAX_ATTEMPTS;
}
function retryDelay(retry, retryAfterMs, random = Math.random, scale = 1, reason = "server") {
  if (retryAfterMs !== void 0) {
    if (retryAfterMs > MAX_RETRY_AFTER_MS) return null;
    return Math.max(0, retryAfterMs);
  }
  const limited = reason === "rate_limit";
  const base = Math.min(limited ? MAX_RETRY_AFTER_MS : MAX_DELAY_MS, (limited ? RATE_LIMIT_BASE_MS : BASE_DELAY_MS) * 2 ** (retry - 1));
  const jitter = base * (limited ? RATE_LIMIT_JITTER : JITTER_RATIO) * (random() * 2 - 1);
  return Math.round(Math.max(0, base + jitter) * scale);
}
function errorRetryReason(error) {
  if (error instanceof TurnCanceledError || !(error instanceof ProviderHostError)) return null;
  switch (error.code) {
    case "AGENT_PROVIDER_TIMEOUT":
      return "timeout";
    case "AGENT_PROVIDER_REQUEST_FAILED":
      return "transport";
    case "AGENT_PROVIDER_STREAM_FAILED":
    case "AGENT_PROVIDER_STREAM_MISSING":
    case "AGENT_PROVIDER_FINISH_MISSING":
      return "stream";
    case "AGENT_PROVIDER_RESPONSE_ERROR":
      return error.retryable ? "server" : null;
    default:
      return null;
  }
}
function streamErrorTransient(event) {
  const error = event.error && typeof event.error === "object" ? event.error : event;
  const label = `${String(error.type ?? "")} ${String(error.code ?? "")}`.toLowerCase();
  return /overloaded|rate[_\s-]?limit|server_error|api_error|timeout|unavailable|try again|too_many/.test(label) && !isQuotaExhausted(JSON.stringify(event).slice(0, 2e3));
}
function sleep(ms, signal) {
  if (signal.aborted) return Promise.reject(new TurnCanceledError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new TurnCanceledError());
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

// src/provider/tool-disclosure.ts
var REQUEST_TOOLS = "request_tools";
var DISCLOSE_ABOVE = 12;
var MAX_PER_REQUEST = 4;
var ToolDisclosure = class {
  constructor(catalog) {
    this.catalog = catalog;
    const core = new Set(CORE_TOOLS);
    const active = catalog.tools.length > DISCLOSE_ABOVE && !catalog.byWireName.has(REQUEST_TOOLS);
    this.lazy = active ? catalog.tools.filter((tool) => !core.has(tool.originalName)) : [];
  }
  catalog;
  loaded = /* @__PURE__ */ new Set();
  lazy;
  /**
   * Tools for the next request. The order only ever grows at the end (core
   * tools, `request_tools`, `read_result`, then loaded tools in the order they
   * were loaded), and `request_tools` reads the same on every request, so the
   * provider's prompt cache survives a tool being loaded.
   */
  visible() {
    const lazy = new Set(this.lazy.map((tool) => tool.wireName));
    const tools = this.catalog.tools.filter((tool) => !lazy.has(tool.wireName));
    if (lazy.size > 0) tools.push(this.requestTool());
    if (this.catalog.tools.length > 0) tools.push(readResultTool());
    for (const name of this.loaded) {
      const tool = this.catalog.byWireName.get(name);
      if (tool && lazy.has(name)) tools.push(tool);
    }
    return tools;
  }
  /** `read_result` is answered by the host from this turn's saved results. */
  isReadResult(wireName) {
    return wireName === READ_RESULT && this.catalog.tools.length > 0 && !this.catalog.byWireName.has(READ_RESULT);
  }
  isRequestTools(wireName) {
    return wireName === REQUEST_TOOLS && this.lazy.length > 0;
  }
  /** A catalog tool the model called directly counts as loaded from then on. */
  noteCalled(wireName) {
    if (this.lazy.some((tool) => tool.wireName === wireName)) this.loaded.add(wireName);
  }
  /** Answers a `request_tools` call. */
  load(argumentsValue) {
    const requested = argumentsValue && typeof argumentsValue === "object" && Array.isArray(argumentsValue.tools) ? argumentsValue.tools.filter((name) => typeof name === "string").slice(0, MAX_PER_REQUEST) : [];
    const loaded = [];
    const unknown = [];
    for (const name of requested) {
      const tool = this.lazy.find((candidate) => candidate.wireName === name || candidate.originalName === name);
      if (!tool) {
        unknown.push(name);
        continue;
      }
      this.loaded.add(tool.wireName);
      loaded.push(tool.wireName);
    }
    return {
      loaded,
      ...unknown.length ? { unknown } : {},
      note: loaded.length ? "\u5DF2\u52A0\u8F7D\u3002\u4E0B\u4E00\u6B65\u5C31\u80FD\u770B\u5230\u8FD9\u4E9B\u5DE5\u5177\u7684\u5B8C\u6574\u53C2\u6570\u5E76\u76F4\u63A5\u8C03\u7528\uFF1B\u52A0\u8F7D\u4E0D\u7B49\u4E8E\u5FC5\u987B\u8C03\u7528\u3002" : "\u6CA1\u6709\u52A0\u8F7D\u4EFB\u4F55\u5DE5\u5177\uFF1A\u8BF7\u53EA\u586B\u5199 request_tools \u8BF4\u660E\u91CC\u5217\u51FA\u7684\u540D\u79F0\u3002"
    };
  }
  requestTool() {
    const names = this.lazy.map((tool) => tool.wireName);
    const listed = this.lazy.map((tool) => `${tool.wireName}\uFF08${toolHint(tool.originalName, tool.description)}\uFF09`);
    return {
      originalName: REQUEST_TOOLS,
      inputSchemaId: "alpha.agent.request_tools.input.v1",
      wireName: REQUEST_TOOLS,
      description: `\u6309\u9700\u52A0\u8F7D\u5C1A\u672A\u5C55\u793A\u7684\u5DE5\u5177\u3002\u53EF\u52A0\u8F7D\uFF1A${listed.join("\uFF1B")}\u3002\u53C2\u6570\u53EA\u586B\u5DE5\u5177\u540D\uFF0C\u4E00\u6B21\u6700\u591A ${MAX_PER_REQUEST} \u4E2A\uFF1B\u540C\u4E00\u6B65\u91CC\u4E0D\u8981\u540C\u65F6\u8C03\u7528\u5C1A\u672A\u5C55\u793A\u7684\u5DE5\u5177\uFF0C\u7B49\u52A0\u8F7D\u7ED3\u679C\u8FD4\u56DE\u3001\u4E0B\u4E00\u6B65\u770B\u5230\u5B8C\u6574\u5B9A\u4E49\u540E\u518D\u8C03\u7528\u3002\u5DF2\u7ECF\u5C55\u793A\uFF08\u542B\u5DF2\u52A0\u8F7D\uFF09\u7684\u5DE5\u5177\u76F4\u63A5\u8C03\u7528\uFF0C\u4E0D\u8981\u91CD\u590D\u52A0\u8F7D\u3002`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["tools"],
        properties: { tools: { type: "array", minItems: 1, maxItems: MAX_PER_REQUEST, items: { type: "string", enum: [...names] } } }
      }
    };
  }
};

// src/provider/tool-wait-budget.ts
function toolWaitBudget(tools, names, responseTimeout) {
  let total = 1e4;
  for (const name of names) {
    const tool = tools.find((candidate) => candidate.toolName === name);
    const declared = Number(tool?.timeoutMs) || responseTimeout;
    const background = name.startsWith("wechat.") && tool?.sideEffectClass === "none" && tool.approvalPolicy === "never" && declared >= 3e4;
    total += background ? 66e4 : declared;
  }
  return Math.max(responseTimeout, total);
}

// src/provider/usage.ts
function count(value) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}
function record2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function chatUsage(usage) {
  const hit = count(usage.prompt_cache_hit_tokens);
  const miss = count(usage.prompt_cache_miss_tokens);
  const cached = hit || count(record2(usage.prompt_tokens_details)?.cached_tokens) || count(usage.cached_tokens);
  return {
    inputTokens: Math.max(count(usage.prompt_tokens), hit + miss),
    outputTokens: count(usage.completion_tokens),
    cacheReadTokens: cached,
    cacheWriteTokens: count(record2(usage.prompt_tokens_details)?.cache_creation_tokens) || count(usage.cache_creation_input_tokens),
    reasoningTokens: count(record2(usage.completion_tokens_details)?.reasoning_tokens)
  };
}
function responsesUsage(usage) {
  return {
    inputTokens: count(usage.input_tokens),
    outputTokens: count(usage.output_tokens),
    cacheReadTokens: count(record2(usage.input_tokens_details)?.cached_tokens),
    cacheWriteTokens: 0,
    reasoningTokens: count(record2(usage.output_tokens_details)?.reasoning_tokens)
  };
}
function anthropicUsage(usage) {
  const read2 = count(usage.cache_read_input_tokens);
  const write = count(usage.cache_creation_input_tokens);
  const fresh = count(usage.input_tokens);
  return {
    inputTokens: fresh + read2 + write,
    outputTokens: count(usage.output_tokens),
    cacheReadTokens: read2,
    cacheWriteTokens: write,
    reasoningTokens: 0
  };
}
function geminiUsage(usage) {
  const thoughts = count(usage.thoughtsTokenCount);
  return {
    inputTokens: count(usage.promptTokenCount),
    outputTokens: count(usage.candidatesTokenCount) + thoughts,
    cacheReadTokens: count(usage.cachedContentTokenCount),
    cacheWriteTokens: 0,
    reasoningTokens: thoughts
  };
}
function usageReported(use, providerRequestId, purpose = "") {
  return {
    inputTokens: BigInt(use.inputTokens),
    outputTokens: BigInt(use.outputTokens),
    cacheReadTokens: BigInt(Math.min(use.cacheReadTokens, use.inputTokens || use.cacheReadTokens)),
    cacheWriteTokens: BigInt(use.cacheWriteTokens),
    reasoningTokens: BigInt(Math.min(use.reasoningTokens, use.outputTokens || use.reasoningTokens)),
    purpose,
    providerRequestId
  };
}

// src/provider/opencode-go.ts
var OPENCODE_GO_KIND = "opencode-go";
var OPENCODE_GO_ROOT = "https://opencode.ai/inference/go";
var OPENCODE_GO_USER_AGENT = "Alpha-Agent/1.0";
var OPENCODE_GO_SESSION_HEADER = "x-opencode-session";
function opencodeGoWire(model) {
  const id = model.trim().toLowerCase();
  if (/^gemini-/.test(id)) return "gemini";
  if (/^(?:claude-|minimax-|qwen)/.test(id)) return "anthropic";
  if (/^(?:gpt-|grok-|muse-|o\d)/.test(id)) return "openai-responses";
  return "openai-chat";
}
function opencodeGoBase(root, wire) {
  const base = root.trim().replace(/\/+$/, "");
  if (wire === "anthropic") return `${base}/anthropic`;
  if (wire === "gemini") return `${base}/google/v1beta`;
  return `${base}/openai/v1`;
}
var OpenCodeGoProvider = class {
  constructor(config) {
    this.config = config;
    this.route(config.model);
  }
  config;
  kind = OPENCODE_GO_KIND;
  routes = /* @__PURE__ */ new Map();
  runTurn(context) {
    return this.route(context.request.provider?.modelId?.trim() || this.config.model).runTurn(context);
  }
  route(model) {
    const wire = opencodeGoWire(model);
    let provider = this.routes.get(wire);
    if (!provider) {
      provider = new HttpProvider({
        ...this.config,
        kind: wire,
        baseURL: opencodeGoBase(this.config.baseURL, wire),
        acceptKind: OPENCODE_GO_KIND,
        identity: { userAgent: OPENCODE_GO_USER_AGENT, sessionHeader: OPENCODE_GO_SESSION_HEADER }
      });
      this.routes.set(wire, provider);
    }
    return provider;
  }
};

// src/provider/http-provider.ts
var MAX_EVENT_BYTES = 8 * 1024 * 1024;
var MAX_TOOL_ARGUMENT_BYTES = 1 * 1024 * 1024;
var MAX_TOOL_CALLS = 128;
var MAX_TOOL_ROUNDS = 32;
var MAX_STRUCTURED_OUTPUT_SCHEMA_BYTES = 64 * 1024;
var MAX_ERROR_BODY_BYTES = 16 * 1024;
var HARD_CAP_MS = 20 * 6e4;
var HttpProvider = class {
  kind;
  config;
  credential;
  constructor(config) {
    this.kind = config.kind;
    const baseURL = normalizeBaseURL(config.baseURL);
    if (!baseURL) throw new ProviderHostError("AGENT_PROVIDER_BASE_URL_INVALID");
    const apiKey = config.apiKey;
    this.credential = typeof apiKey === "function" ? apiKey : () => apiKey;
    if (!this.credential().trim()) throw new ProviderHostError("AGENT_PROVIDER_CREDENTIAL_MISSING");
    if (!config.model.trim()) throw new ProviderHostError("AGENT_PROVIDER_MODEL_MISSING");
    validateProviderURL(baseURL);
    this.config = {
      baseURL,
      model: config.model.trim(),
      timeoutMs: positiveTimeout(config.timeoutMs ?? 12e4),
      fetchImpl: config.fetchImpl,
      profile: config.profile ?? DEFAULT_MODEL_PROFILE,
      retryScale: config.retryScale ?? 1,
      acceptKind: config.acceptKind,
      identity: config.identity
    };
  }
  async *runTurn(context) {
    if (context.request.provider?.providerKind !== (this.config.acceptKind ?? this.kind)) {
      throw new ProviderHostError("AGENT_PROVIDER_KIND_MISMATCH");
    }
    if (context.signal.aborted) throw new TurnCanceledError();
    const catalog = bindHttpTools(context.request.tools);
    const disclosure = new ToolDisclosure(catalog);
    const profile = this.config.profile;
    const budget = contextBudget(profile);
    const conversation = createProviderConversation(this.kind, context.request.context, profile.imageInput);
    const model = context.request.provider?.modelId?.trim() || this.config.model;
    const compaction = startCompaction(conversation);
    const emittedCallIds = /* @__PURE__ */ new Set();
    let effort = supportedReasoningLevel(reasoningEffortOf(context.request.reasoningEffort), profile);
    let overflowRetried = false;
    let requests = 0;
    for (let toolRound = 0; ; toolRound += 1) {
      if (toolRound >= MAX_TOOL_ROUNDS) {
        throw new ProviderHostError("AGENT_PROVIDER_TOOL_ROUND_LIMIT");
      }
      const tools = disclosure.visible();
      let carried = "";
      let parsed;
      for (let attempt = 1; ; attempt += 1) {
        yield* this.fitContext(context, conversation, tools, budget, false, model, compaction);
        const trial = emptyParsedTurn("");
        let handle;
        let failure;
        try {
          const undo = carried ? addContinuation(conversation, carried) : void 0;
          try {
            handle = await this.request(context, conversation, model, tools, effort, context.request.structuredOutput);
          } finally {
            undo?.();
          }
          const response = handle.response;
          requests += 1;
          trial.responseId = response.headers.get("x-request-id") ?? "";
          if (response.status === 400 || response.status === 413 || response.status === 422) {
            const detail = await readErrorBody(handle);
            handle = void 0;
            if (isContextOverflow(response.status, detail) && !overflowRetried) {
              overflowRetried = true;
              yield* this.fitContext(context, conversation, tools, budget, true, model, compaction);
              attempt -= 1;
              continue;
            }
            if (effort && response.status !== 413 && !isContextOverflow(response.status, detail)) {
              effort = "";
              attempt -= 1;
              continue;
            }
            if (isContextOverflow(response.status, detail)) throw new ProviderHostError("AGENT_PROVIDER_CONTEXT_OVERFLOW");
            const plan = planError(errorRecord(detail));
            throw new ProviderHostError(plan?.code ?? `AGENT_PROVIDER_HTTP_${response.status}`, plan?.retryable ?? false);
          }
          if (!response.ok) {
            const reason = statusRetryReason(response.status);
            const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
            const detail = await readErrorBody(handle);
            handle = void 0;
            const plan = PLAN_REFUSAL_STATUSES.has(response.status) ? planError(errorRecord(detail)) : void 0;
            const error = new ProviderHostError(plan?.code ?? `AGENT_PROVIDER_HTTP_${response.status}`, plan ? plan.retryable : response.status >= 500);
            if (plan && !plan.retryable) throw error;
            if (!reason || isQuotaExhausted(detail)) throw error;
            failure = { reason, error, retryAfterMs: retryAfter };
          } else {
            if (!response.body) throw new ProviderHostError("AGENT_PROVIDER_STREAM_MISSING", true);
            yield* this.parseBody(response.body, context, handle, trial);
            parsed = trial;
            if (carried) parsed.assistantText = carried + parsed.assistantText;
            yield usageEvent(parsed, requests);
            break;
          }
        } catch (error) {
          if (context.signal.aborted || error instanceof TurnCanceledError) throw error;
          const reason = errorRetryReason(error);
          if (!reason) throw error;
          failure = { reason, error };
        } finally {
          handle?.cleanup();
        }
        if (!failure) throw new ProviderHostError("AGENT_PROVIDER_REQUEST_FAILED", true);
        const delay = attempt < attemptLimit(failure.reason) ? retryDelay(attempt, failure.retryAfterMs, Math.random, this.config.retryScale, failure.reason) : null;
        if (delay === null) throw failure.error;
        carried += trial.assistantText;
        yield {
          kind: "retry",
          value: { reason: failure.reason, attempt: attempt + 1, maxAttempts: MAX_ATTEMPTS, delayMs: BigInt(delay), continuesText: carried.length > 0 }
        };
        await sleep(delay, context.signal);
      }
      if (parsed.toolCalls.length > 0) {
        for (const call of parsed.toolCalls) {
          if (disclosure.isRequestTools(call.wireToolName) || disclosure.isReadResult(call.wireToolName)) {
            call.toolName = call.wireToolName;
            continue;
          }
          const binding = catalog.byWireName.get(call.wireToolName);
          if (!binding) throw new ProviderHostError("AGENT_PROVIDER_TOOL_UNKNOWN");
          call.toolName = binding.originalName;
          disclosure.noteCalled(call.wireToolName);
        }
        const remapped = /* @__PURE__ */ new Map();
        for (const [index, call] of parsed.toolCalls.entries()) {
          if (!call.providerCallId) {
            const id = `${this.kind}:${context.request.turnId}:round:${toolRound + 1}:tool:${index + 1}`;
            remapped.set(call.toolCallId, id);
            call.toolCallId = id;
          }
        }
        parsed.assistantBlocks = parsed.assistantBlocks.map((block) => block.type === "tool_use" && remapped.has(stringValue(block.id)) ? { ...block, id: remapped.get(stringValue(block.id)) } : block);
        assertUniqueToolCalls(parsed.toolCalls);
        if (parsed.toolCalls.some((call) => emittedCallIds.has(call.toolCallId))) {
          throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
        }
        const isLocal = (call) => disclosure.isRequestTools(call.wireToolName) || disclosure.isReadResult(call.wireToolName);
        const local = parsed.toolCalls.filter(isLocal);
        const remote = parsed.toolCalls.filter((call) => !isLocal(call));
        const calls = remote.map((call) => this.toToolCallRequested(catalog, call));
        for (const call of parsed.toolCalls) emittedCallIds.add(call.toolCallId);
        for (const call of calls) yield { kind: "toolCall", value: call };
        const engineResults = remote.length > 0 ? await waitForToolResults(
          context,
          remote,
          toolWaitBudget(context.request.tools, remote.map((call) => call.toolName), this.config.timeoutMs)
        ) : [];
        const localResults = local.map((call) => disclosure.isReadResult(call.wireToolName) ? {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          result: { schemaId: "alpha.agent.read_result.output.v1", canonicalJson: encodeCanonicalJson(conversation.store.read(call.arguments)) }
        } : {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          result: { schemaId: "alpha.agent.request_tools.output.v1", canonicalJson: encodeCanonicalJson(disclosure.load(call.arguments)) }
        });
        appendToolRound(conversation, parsed, parsed.toolCalls, [...engineResults, ...localResults], budget.toolResult);
        continue;
      }
      if (isToolFinishReason(this.kind, parsed.finishReason)) {
        throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
      }
      yield finish(parsed.finishReason || "stop", parsed.responseId);
      return;
    }
  }
  /** Reads a response stream with the parser of the active wire format. */
  parseBody(body, context, handle, parsed) {
    if (this.kind === "gemini") return this.parseGemini(body, context, handle, parsed);
    if (this.kind === "anthropic") return this.parseAnthropic(body, context, handle, parsed);
    if (this.kind === "openai-responses") return this.parseResponses(body, context, handle, parsed);
    return this.parseOpenAI(body, context, handle, parsed);
  }
  /**
   * Keeps the next request inside the budget, gentlest step first: old tool
   * results are cleared, then earlier turns are summarized (or, when a summary
   * cannot be had, dropped oldest first). `force` (after a provider overflow)
   * clears every tool result but the latest round and every earlier turn,
   * without spending another request on a summary.
   */
  async *fitContext(context, conversation, tools, budget, force, model, compaction) {
    const toolTokens = estimatePayload(toolsToAnthropic(tools));
    const estimate = () => toolTokens + estimatePayload(conversation.messages) + estimatePayload(conversation.systemText);
    const before = estimate();
    let cleared = 0;
    let summarized = 0;
    if (force) {
      cleared = pruneToolResults(conversation.slots, conversation.round, () => Number.POSITIVE_INFINITY, 0);
      while (dropOldestHistory(conversation)) {
      }
      if (cleared > 0 || before > estimate()) yield compactionEvent("overflow", before, estimate(), cleared, 0);
      return;
    }
    if (estimate() <= budget.pruneAbove) return;
    cleared = pruneToolResults(conversation.slots, conversation.round, estimate, budget.pruneTo);
    if (estimate() > budget.pruneAbove && conversation.history > 0 && compaction.entries.length > compaction.covered) {
      summarized = yield* this.summarizeHistory(context, conversation, budget, model, compaction);
    }
    while (estimate() > budget.input && dropOldestHistory(conversation)) {
    }
    const after = estimate();
    if (cleared > 0 || summarized > 0 || after < before) yield compactionEvent("proactive", before, after, cleared, summarized);
  }
  /**
   * One model request that turns the earlier turns (and an earlier summary of
   * them) into a new summary; it replaces them in `conversation`. Returns how
   * many turns were newly covered, 0 when no usable summary came back.
   */
  async *summarizeHistory(context, conversation, budget, model, compaction) {
    const fresh = compaction.entries.slice(compaction.covered);
    const prompt = summaryPrompt(fresh, compaction.summary, budget.summaryTokens, Math.floor(budget.input * 0.6));
    const trial = emptyParsedTurn("");
    let handle;
    try {
      handle = await this.request(context, textConversation(this.kind, SUMMARY_SYSTEM, prompt), model, [], "", void 0);
      if (!handle.response.ok || !handle.response.body) {
        void handle.response.body?.cancel().catch(() => void 0);
        return 0;
      }
      trial.responseId = handle.response.headers.get("x-request-id") ?? "";
      for await (const _ignored of this.parseBody(handle.response.body, context, handle, trial)) {
      }
      yield usageEvent(trial, 0, "compaction");
    } catch (error) {
      if (context.signal.aborted || error instanceof TurnCanceledError) throw error;
      return 0;
    } finally {
      handle?.cleanup();
    }
    const summary = trial.assistantText.trim();
    const covered = compaction.entries.length;
    const replaced = compaction.summary ? [{ role: "user", text: compaction.summary }, ...fresh] : fresh;
    if (trial.finishReason === "length" || !shrinks(summary, replaced)) return 0;
    replaceHistory(conversation, conversation.history, summaryMessage(summary));
    rememberSummary(compaction.chain, covered, summary);
    const newly = covered - compaction.covered;
    compaction.covered = covered;
    compaction.summary = summary;
    return newly;
  }
  async request(context, conversation, model, tools, effort, structuredOutput) {
    const controller = new AbortController();
    const startedAt = Date.now();
    const idleMs = this.config.timeoutMs;
    let deadline = startedAt + idleMs;
    let timedOut = false;
    let timer;
    const arm = () => {
      if (timer) clearTimeout(timer);
      const hardLimit = startedAt + HARD_CAP_MS;
      deadline = Math.min(Date.now() + idleMs, hardLimit);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, Math.max(1, deadline - Date.now()));
    };
    arm();
    const abort = () => controller.abort();
    context.signal.addEventListener("abort", abort, { once: true });
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      context.signal.removeEventListener("abort", abort);
    };
    try {
      const request = this.buildRequest(
        conversation,
        tools,
        model,
        structuredOutput,
        effort
      );
      const fetchImpl = this.config.fetchImpl ?? fetch;
      const identity = this.config.identity;
      const response = await fetchImpl(request.url, {
        method: "POST",
        // The conversation id keeps one session per thread; a run without one is its own session.
        headers: identity ? { ...request.headers, "user-agent": identity.userAgent, [identity.sessionHeader]: context.request.promptCacheKey || context.request.runId } : request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal
      });
      return {
        response,
        signal: controller.signal,
        get deadline() {
          return deadline;
        },
        timedOut: () => timedOut,
        touch: arm,
        cleanup
      };
    } catch (error) {
      cleanup();
      if (context.signal.aborted) throw new TurnCanceledError();
      if (timedOut || isAbortError(error)) throw new ProviderHostError("AGENT_PROVIDER_TIMEOUT", true);
      if (error instanceof ProviderHostError) throw error;
      throw new ProviderHostError("AGENT_PROVIDER_REQUEST_FAILED", true);
    }
  }
  buildRequest(conversation, tools, model, structuredOutput, effort = "") {
    const output = structuredOutputSpec(structuredOutput);
    const url = endpointURL(this.kind, this.config.baseURL, model);
    const apiKey = this.credential();
    const maxOutput = this.config.profile.maxOutputTokens;
    if (this.kind === "gemini") {
      return {
        url,
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          "x-goog-api-key": apiKey
        },
        body: {
          ...conversation.systemText ? { systemInstruction: { parts: [{ text: conversation.systemText }] } } : {},
          contents: conversation.messages,
          generationConfig: {
            temperature: 0.2,
            ...maxOutput ? { maxOutputTokens: maxOutput } : {},
            ...geminiThinking(effort, model),
            ...output ? { responseMimeType: "application/json", responseJsonSchema: output.schema } : {}
          },
          ...tools.length > 0 ? { tools: toolsToGemini(tools) } : {}
        }
      };
    }
    if (this.kind === "anthropic") {
      return {
        url,
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: {
          model,
          max_tokens: maxOutput ?? 8192,
          ...anthropicThinking(effort, maxOutput),
          ...conversation.systemText ? { system: conversation.systemText } : {},
          messages: conversation.messages,
          stream: true,
          ...output ? { output_config: { format: { type: "json_schema", schema: output.schema } } } : {},
          ...tools.length > 0 ? { tools: toolsToAnthropic(tools) } : {}
        }
      };
    }
    const headers = {
      "content-type": "application/json",
      accept: "text/event-stream",
      authorization: `Bearer ${apiKey}`
    };
    if (this.kind === "openai-responses") {
      return {
        url,
        headers,
        body: {
          model,
          ...conversation.systemText ? { instructions: conversation.systemText } : {},
          input: conversation.messages,
          ...maxOutput ? { max_output_tokens: maxOutput } : {},
          stream: true,
          // Continuations resend the items; nothing is kept on the provider side.
          store: false,
          ...effort ? { reasoning: { effort: openAIEffort(effort, model) } } : {},
          ...output ? { text: { format: { type: "json_schema", name: output.name, strict: true, schema: output.schema } } } : {},
          ...tools.length > 0 ? { tools: toolsToResponses(tools) } : {}
        }
      };
    }
    return {
      url,
      headers,
      body: {
        model,
        messages: conversation.messages,
        stream: true,
        stream_options: { include_usage: true },
        ...chatThinking(effort, model),
        ...output ? jsonObjectOnly(this.config.baseURL) ? { response_format: { type: "json_object" } } : {
          response_format: {
            type: "json_schema",
            json_schema: { name: output.name, strict: true, schema: output.schema }
          }
        } : {},
        ...tools.length > 0 ? { tools: toolsToOpenAI(tools) } : {}
      }
    };
  }
  async *parseOpenAI(body, context, handle, parsed) {
    const accumulators = /* @__PURE__ */ new Map();
    let nextIndex = 0;
    let sawDone = false;
    for await (const payload of readSSE(body, handle)) {
      if (payload === "[DONE]") {
        sawDone = true;
        break;
      }
      const json = parseEvent(payload);
      if (!json) continue;
      parsed.responseId = stringValue(json.id) || parsed.responseId;
      const choice = arrayValue(json.choices)[0];
      const delta = recordValue(choice, "delta");
      const text = textValue(delta?.content);
      if (text) {
        parsed.assistantText += text;
        yield { kind: "textDelta", value: { messageId: `${this.kind}:${parsed.responseId}:assistant`, delta: text } };
      }
      const echoed = textValue(delta?.reasoning_content);
      const reasoning = echoed || textValue(delta?.reasoning);
      if (echoed) parsed.assistantReasoning += echoed;
      if (reasoning) yield { kind: "reasoningDelta", value: { delta: reasoning } };
      for (const value of arrayValue(delta?.tool_calls)) {
        const index = integerValue(value.index, nextIndex++);
        const key = `index:${index}`;
        const accumulator = getToolAccumulator(accumulators, key, index, parsed.responseId);
        const functionValue = recordValue(value, "function");
        const id = stringValue(value.id);
        const name = stringValue(functionValue?.name) || stringValue(value.name);
        if (id && accumulator.hasProviderToolCallId && accumulator.toolCallId !== id || name && accumulator.toolName && accumulator.toolName !== name) {
          throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
        }
        if (id) {
          accumulator.toolCallId = id;
          accumulator.hasProviderToolCallId = true;
        }
        if (name) accumulator.toolName = name;
        appendArgumentFragment(accumulator, functionValue?.arguments ?? value.arguments);
      }
      const legacyFunction = recordValue(delta, "function_call");
      if (legacyFunction) {
        const accumulator = getToolAccumulator(accumulators, "legacy:0", 0, parsed.responseId);
        accumulator.toolName ||= stringValue(legacyFunction.name);
        appendArgumentFragment(accumulator, legacyFunction.arguments);
      }
      const finishReason = stringValue(choice?.finish_reason);
      if (finishReason && !parsed.finishReason) parsed.finishReason = finishReason;
      const usage = recordValue(json, "usage");
      if (usage) mergeUse(parsed, chatUsage(usage));
      throwIfRequestInactive(handle, context.signal);
    }
    if (!parsed.finishReason && (!sawDone || accumulators.size > 0)) {
      throw new ProviderHostError("AGENT_PROVIDER_FINISH_MISSING");
    }
    parsed.toolCalls = finalizeToolCalls(accumulators, this.kind, parsed.responseId);
  }
  async *parseGemini(body, context, handle, parsed) {
    const accumulators = /* @__PURE__ */ new Map();
    const completeCalls = /* @__PURE__ */ new Set();
    let nextToolIndex = 0;
    for await (const payload of readSSE(body, handle)) {
      const json = parseEvent(payload);
      if (!json) continue;
      parsed.responseId = stringValue(json.responseId) || parsed.responseId;
      const candidate = arrayValue(json.candidates)[0];
      const candidateContent = recordValue(candidate, "content");
      const frameCallIds = /* @__PURE__ */ new Set();
      for (const [partIndex, part] of arrayValue(candidateContent?.parts).entries()) {
        const text = textValue(part.text);
        if (text) {
          if (part.thought === true) yield { kind: "reasoningDelta", value: { delta: text } };
          else {
            parsed.assistantText += text;
            yield { kind: "textDelta", value: { messageId: `${this.kind}:${parsed.responseId}:assistant`, delta: text } };
          }
        }
        const functionCall = recordValue(part, "functionCall") ?? recordValue(part, "function_call");
        if (functionCall) {
          const id = stringValue(functionCall.id);
          const name = stringValue(functionCall.name);
          if (id && frameCallIds.has(id)) throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
          if (id) frameCallIds.add(id);
          const argumentsValue = functionCall.args ?? functionCall.arguments;
          const key = id ? `id:${id}` : part.index !== void 0 || typeof argumentsValue === "string" ? `part:${integerValue(part.index, partIndex)}:${name}` : `anonymous:${nextToolIndex}`;
          const index = accumulators.get(key)?.index ?? integerValue(part.index, nextToolIndex++);
          const accumulator = getToolAccumulator(accumulators, key, index, parsed.responseId);
          if (argumentsValue !== void 0) {
            if (completeCalls.has(key)) throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
            if (typeof argumentsValue !== "string") {
              if (accumulator.argumentFragments.length > 0) throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
              completeCalls.add(key);
            }
          }
          if (name && accumulator.toolName && accumulator.toolName !== name) {
            throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
          }
          if (id) {
            accumulator.toolCallId = id;
            accumulator.hasProviderToolCallId = true;
          }
          accumulator.toolName ||= name;
          const thoughtSignature = stringValue(part.thoughtSignature) || stringValue(part.thought_signature);
          if (thoughtSignature) accumulator.wirePart = { thoughtSignature };
          appendArgumentFragment(accumulator, argumentsValue);
        }
      }
      const usage = recordValue(json, "usageMetadata");
      if (usage) mergeUse(parsed, geminiUsage(usage));
      const finishReason = stringValue(candidate?.finishReason);
      if (finishReason && !parsed.finishReason) parsed.finishReason = finishReason.toLowerCase();
      throwIfRequestInactive(handle, context.signal);
    }
    if (!parsed.finishReason) throw new ProviderHostError("AGENT_PROVIDER_FINISH_MISSING");
    parsed.toolCalls = finalizeToolCalls(accumulators, this.kind, parsed.responseId);
    parsed.assistantParts = [
      ...parsed.assistantText ? [{ text: parsed.assistantText }] : [],
      ...geminiToolParts(accumulators, parsed.toolCalls)
    ];
  }
  async *parseAnthropic(body, context, handle, parsed) {
    const blocks = /* @__PURE__ */ new Map();
    const order = [];
    let sawMessageStop = false;
    for await (const payload of readSSE(body, handle)) {
      const json = parseEvent(payload);
      if (!json) continue;
      const eventType = stringValue(json.type);
      if (eventType === "message_start") {
        const message = recordValue(json, "message");
        parsed.responseId = stringValue(message?.id) || parsed.responseId;
        const usage = recordValue(message, "usage");
        if (usage) mergeUse(parsed, anthropicUsage(usage));
      } else if (eventType === "content_block_start") {
        const index = integerValue(json.index, order.length);
        if (blocks.has(index)) throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
        const block = getAnthropicBlock(blocks, order, index);
        const contentBlock = recordValue(json, "content_block");
        block.type = stringValue(contentBlock?.type) || block.type;
        block.thinking = stringValue(contentBlock?.thinking) || block.thinking;
        block.signature = stringValue(contentBlock?.signature) || block.signature;
        block.toolCallId = stringValue(contentBlock?.id) || block.toolCallId;
        block.toolName = stringValue(contentBlock?.name) || block.toolName;
        if (contentBlock?.input !== void 0) {
          block.argumentValue = contentBlock.input;
          block.hasArgumentValue = true;
        }
      } else if (eventType === "content_block_delta") {
        const index = integerValue(json.index, order.length);
        const block = getAnthropicBlock(blocks, order, index);
        const delta = recordValue(json, "delta");
        const deltaType = stringValue(delta?.type);
        const text = textValue(delta?.text);
        if (deltaType === "text_delta" || text && deltaType !== "input_json_delta") {
          parsed.assistantText += text;
          if (text) yield { kind: "textDelta", value: { messageId: `${this.kind}:${parsed.responseId}:assistant`, delta: text } };
          block.text += text;
        }
        const thinking = textValue(delta?.thinking) || textValue(delta?.thinking_delta);
        if (thinking) {
          block.thinking += thinking;
          yield { kind: "reasoningDelta", value: { delta: thinking } };
        }
        const signature = stringValue(delta?.signature);
        if (signature) block.signature += signature;
        if (deltaType === "input_json_delta" || delta?.partial_json !== void 0) {
          appendArgumentFragment(block, delta?.partial_json);
          block.type = "tool_use";
        }
      } else if (eventType === "message_delta") {
        const usage = recordValue(json, "usage");
        if (usage) mergeUse(parsed, anthropicUsage(usage));
        const stop = stringValue(recordValue(json, "delta")?.stop_reason);
        if (stop && !parsed.finishReason) parsed.finishReason = stop;
      } else if (eventType === "message_stop") {
        sawMessageStop = true;
        if (!parsed.finishReason) parsed.finishReason = "stop";
      }
      throwIfRequestInactive(handle, context.signal);
    }
    if (!parsed.finishReason) throw new ProviderHostError("AGENT_PROVIDER_FINISH_MISSING");
    const finalized = finalizeAnthropicBlocks(blocks, order, parsed.responseId);
    if (finalized.calls.length > 0 && !sawMessageStop) {
      throw new ProviderHostError("AGENT_PROVIDER_FINISH_MISSING");
    }
    parsed.toolCalls = finalized.calls;
    parsed.assistantBlocks = finalized.blocks;
  }
  async *parseResponses(body, context, handle, parsed) {
    const accumulators = /* @__PURE__ */ new Map();
    const bind = (outputIndex, item) => {
      const accumulator = getToolAccumulator(accumulators, `output:${outputIndex}`, outputIndex, parsed.responseId);
      const id = stringValue(item?.call_id);
      const name = stringValue(item?.name);
      if (id && accumulator.hasProviderToolCallId && accumulator.toolCallId !== id || name && accumulator.toolName && accumulator.toolName !== name) {
        throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
      }
      if (id) {
        accumulator.toolCallId = id;
        accumulator.hasProviderToolCallId = true;
      }
      if (name) accumulator.toolName = name;
      return accumulator;
    };
    const complete = (accumulator, value) => {
      if (typeof value !== "string" || !value) return;
      accumulator.argumentFragments = "";
      appendArgumentFragment(accumulator, value);
    };
    let terminal = false;
    for await (const payload of readSSE(body, handle)) {
      const json = parseEvent(payload);
      if (!json) continue;
      const eventType = stringValue(json.type);
      const outputIndex = integerValue(json.output_index, 0);
      if (eventType === "response.created" || eventType === "response.in_progress") {
        parsed.responseId = stringValue(recordValue(json, "response")?.id) || parsed.responseId;
      } else if (eventType === "response.output_text.delta" || eventType === "response.refusal.delta") {
        const text = textValue(json.delta);
        if (text) {
          parsed.assistantText += text;
          yield { kind: "textDelta", value: { messageId: `${this.kind}:${parsed.responseId}:assistant`, delta: text } };
        }
      } else if (eventType === "response.reasoning_summary_text.delta" || eventType === "response.reasoning_text.delta") {
        const text = textValue(json.delta);
        if (text) yield { kind: "reasoningDelta", value: { delta: text } };
      } else if (eventType === "response.output_item.added" || eventType === "response.output_item.done") {
        const item = recordValue(json, "item");
        if (stringValue(item?.type) === "function_call") {
          const accumulator = bind(outputIndex, item);
          if (eventType === "response.output_item.done") complete(accumulator, item?.arguments);
        }
      } else if (eventType === "response.function_call_arguments.delta") {
        appendArgumentFragment(bind(outputIndex, void 0), json.delta);
      } else if (eventType === "response.function_call_arguments.done") {
        complete(bind(outputIndex, void 0), json.arguments);
      } else if (eventType === "response.completed" || eventType === "response.incomplete") {
        const response = recordValue(json, "response");
        parsed.responseId = stringValue(response?.id) || parsed.responseId;
        const usage = recordValue(response, "usage");
        if (usage) mergeUse(parsed, responsesUsage(usage));
        if (eventType === "response.incomplete") {
          if (accumulators.size > 0) throw new ProviderHostError("AGENT_PROVIDER_FINISH_MISSING");
          parsed.finishReason = stringValue(recordValue(response, "incomplete_details")?.reason) || "incomplete";
        } else {
          parsed.finishReason = accumulators.size > 0 ? "tool_calls" : "stop";
        }
        terminal = true;
      } else if (eventType === "response.failed") {
        const plan = planError(recordValue(recordValue(json, "response"), "error"));
        throw new ProviderHostError(plan?.code ?? "AGENT_PROVIDER_RESPONSE_ERROR", plan?.retryable ?? false);
      }
      throwIfRequestInactive(handle, context.signal);
    }
    if (!terminal) throw new ProviderHostError("AGENT_PROVIDER_FINISH_MISSING");
    parsed.toolCalls = finalizeToolCalls(accumulators, this.kind, parsed.responseId);
  }
  toToolCallRequested(catalog, call) {
    const binding = catalog.byWireName.get(call.wireToolName);
    if (!binding) throw new ProviderHostError("AGENT_PROVIDER_TOOL_UNKNOWN");
    const value = call.arguments === void 0 ? {} : call.arguments;
    const canonicalJson = stringifyCanonicalJson(value);
    if (Buffer.byteLength(canonicalJson, "utf8") > MAX_TOOL_ARGUMENT_BYTES) {
      throw new ProviderHostError("AGENT_PROVIDER_TOOL_ARGUMENTS_TOO_LARGE");
    }
    return {
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      arguments: { schemaId: binding.inputSchemaId, canonicalJson: encodeCanonicalJson(value) }
    };
  }
};
function startCompaction(conversation) {
  const entries = historyEntries(conversation);
  const state = { entries, chain: historyChain(entries), covered: 0, summary: null };
  const hit = cachedSummary(state.chain);
  if (hit) {
    replaceHistory(conversation, hit.covered, summaryMessage(hit.summary));
    state.covered = hit.covered;
    state.summary = hit.summary;
  }
  return state;
}
var CONTINUE_PROMPT = "\uFF08\u4E0A\u4E00\u6BB5\u56DE\u590D\u5728\u4F20\u8F93\u4E2D\u88AB\u6253\u65AD\u3002\u8BF7\u4ECE\u4E2D\u65AD\u5904\u76F4\u63A5\u63A5\u7740\u5199\uFF0C\u4E0D\u8981\u91CD\u590D\u5DF2\u7ECF\u5199\u51FA\u7684\u5185\u5BB9\uFF0C\u4E0D\u8981\u9053\u6B49\u6216\u8BF4\u660E\u3002\uFF09";
function addContinuation(conversation, shown) {
  const { kind, messages } = conversation;
  if (kind === "gemini") {
    messages.push({ role: "model", parts: [{ text: shown }] }, { role: "user", parts: [{ text: CONTINUE_PROMPT }] });
  } else {
    messages.push({ role: "assistant", content: shown }, { role: "user", content: CONTINUE_PROMPT });
  }
  return () => {
    messages.length -= 2;
  };
}
function compactionEvent(trigger, before, after, cleared, summarized) {
  return {
    kind: "compaction",
    value: { trigger, tokensBefore: BigInt(before), tokensAfter: BigInt(after), clearedResults: cleared, summarizedMessages: summarized }
  };
}
var REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"];
function reasoningEffortOf(value) {
  return REASONING_EFFORTS.includes(value ?? "") ? value : "";
}
function openAIEffort(effort, model) {
  return effort === "max" && !isGLM(model) ? "xhigh" : effort;
}
function isGLM(model) {
  return /(?:^|\/)glm-/i.test(model);
}
function chatThinking(effort, model) {
  if (!effort) return {};
  if (!isGLM(model)) return { reasoning_effort: openAIEffort(effort, model) };
  return effort === "none" ? { thinking: { type: "disabled" } } : { thinking: { type: "enabled" }, reasoning_effort: effort };
}
var ANTHROPIC_BUDGET = { low: 2048, medium: 6144, high: 12288, xhigh: 24576, max: 32e3 };
function anthropicThinking(effort, maxOutput) {
  if (!effort || effort === "none") return {};
  const wanted = ANTHROPIC_BUDGET[effort];
  const total = maxOutput ? Math.min(maxOutput, wanted + 8192) : wanted + 8192;
  const budget = Math.min(wanted, total - 1024);
  if (budget < 1024) return {};
  return { max_tokens: total, thinking: { type: "enabled", budget_tokens: budget } };
}
var GEMINI_BUDGET = { low: 2048, medium: 4096, high: 8192, xhigh: 16384, max: 24576 };
function geminiThinking(effort, model) {
  if (!effort || effort === "none") return {};
  if (/gemini-3/i.test(model)) return { thinkingConfig: { thinkingLevel: effort === "low" ? "low" : "high", includeThoughts: true } };
  return { thinkingConfig: { thinkingBudget: GEMINI_BUDGET[effort], includeThoughts: true } };
}
function structuredOutputSpec(contract) {
  if (!contract) return void 0;
  const schemaId = contract.schemaId.trim();
  if (!schemaId || schemaId.length > 128 || !contract.strict) {
    throw new ProviderHostError("AGENT_PROVIDER_STRUCTURED_OUTPUT_INVALID");
  }
  if (contract.canonicalJsonSchema.byteLength === 0 || contract.canonicalJsonSchema.byteLength > MAX_STRUCTURED_OUTPUT_SCHEMA_BYTES) {
    throw new ProviderHostError("AGENT_PROVIDER_STRUCTURED_OUTPUT_INVALID");
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder().decode(contract.canonicalJsonSchema));
  } catch {
    throw new ProviderHostError("AGENT_PROVIDER_STRUCTURED_OUTPUT_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderHostError("AGENT_PROVIDER_STRUCTURED_OUTPUT_INVALID");
  }
  const schema = value;
  if (schema.type !== "object" || schema.additionalProperties !== false) {
    throw new ProviderHostError("AGENT_PROVIDER_STRUCTURED_OUTPUT_INVALID");
  }
  const normalized = schemaId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return { name: normalized || "alpha_structured_output", schema };
}
function createConfiguredProviders(env = process.env) {
  if (env.ALPHA_AGENT_PROVIDER_KIND?.trim().toLowerCase() === OPENCODE_GO_KIND) {
    const apiKey2 = env.ALPHA_AGENT_API_KEY?.trim() ?? "";
    const baseURL2 = env.ALPHA_AGENT_BASE_URL?.trim() || OPENCODE_GO_ROOT;
    const model2 = env.ALPHA_AGENT_MODEL_ID?.trim() ?? "";
    if (!apiKey2 || !model2) return [];
    return [new OpenCodeGoProvider({ apiKey: apiKey2, baseURL: baseURL2, model: model2, timeoutMs: Number(env.ALPHA_AGENT_TIMEOUT_MS) || void 0, profile: modelProfileFromEnv(env) })];
  }
  const kind = normalizeKind(env.ALPHA_AGENT_PROVIDER_KIND);
  const keyFile = env.ALPHA_AGENT_API_KEY_FILE?.trim() ?? "";
  const apiKey = keyFile ? fileCredential(keyFile) : env.ALPHA_AGENT_API_KEY?.trim() ?? "";
  const baseURL = env.ALPHA_AGENT_BASE_URL?.trim() || defaultBaseURL(kind);
  const model = env.ALPHA_AGENT_MODEL_ID?.trim() ?? "";
  if (!kind || !apiKey || !baseURL || !model) return [];
  return [new HttpProvider({ kind, apiKey, baseURL, model, timeoutMs: Number(env.ALPHA_AGENT_TIMEOUT_MS) || void 0, profile: modelProfileFromEnv(env) })];
}
function fileCredential(path) {
  if (!(0, import_node_path.isAbsolute)(path)) return "";
  const read2 = () => {
    let value = "";
    try {
      value = (0, import_node_fs.readFileSync)(path, "utf8").trim();
    } catch {
    }
    if (!value || value.length > 16384 || !/^[\x21-\x7e]+$/.test(value)) throw new ProviderHostError("AGENT_PROVIDER_CREDENTIAL_MISSING");
    return value;
  };
  try {
    read2();
  } catch {
    return "";
  }
  return read2;
}
var PLAN_REFUSAL_STATUSES = /* @__PURE__ */ new Set([401, 403, 429, 503]);
function planError(error) {
  const code = stringValue(error?.code);
  if (code === "subscription_sharing_usage_limit_exceeded") return { code: "AGENT_PROVIDER_PLAN_USAGE_LIMIT", retryable: false };
  if (code === "subscription_sharing_user_not_eligible") return { code: "AGENT_PROVIDER_PLAN_NOT_ELIGIBLE", retryable: false };
  if (code === "subscription_sharing_usage_unavailable" || code === "subscription_sharing_user_unavailable") return { code: "AGENT_PROVIDER_PLAN_UNAVAILABLE", retryable: true };
  if (code === "subscription_sharing_unsupported_capability") return { code: "AGENT_PROVIDER_PLAN_UNSUPPORTED", retryable: false };
  if (code === "subscription_sharing_invalid_user" || code === "subscription_sharing_route_not_supported" || code.startsWith("chatpass_v2_")) {
    return { code: "AGENT_PROVIDER_PLAN_AUTH_REJECTED", retryable: false };
  }
  return void 0;
}
function errorRecord(text) {
  try {
    return recordValue(JSON.parse(text), "error");
  } catch {
    return void 0;
  }
}
async function readErrorBody(handle) {
  const body = handle.response.body;
  let text = "";
  try {
    if (body) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < MAX_ERROR_BODY_BYTES) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        text += decoder.decode(part.value, { stream: true });
      }
      await reader.cancel().catch(() => void 0);
    }
  } catch {
  } finally {
    handle.cleanup();
  }
  return text.slice(0, MAX_ERROR_BODY_BYTES);
}
function normalizeKind(value) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "openai-chat" || normalized === "openai" || normalized === "openai-compatible" || normalized === "deepseek") return "openai-chat";
  if (normalized === "openai-responses" || normalized === "responses") return "openai-responses";
  if (normalized === "gemini" || normalized === "google") return "gemini";
  if (normalized === "anthropic" || normalized === "claude") return "anthropic";
  return void 0;
}
function defaultBaseURL(kind) {
  if (kind === "gemini") return "https://generativelanguage.googleapis.com";
  if (kind === "anthropic") return "https://api.anthropic.com";
  if (kind === "openai-chat" || kind === "openai-responses") return "https://api.openai.com/v1";
  return "";
}
function normalizeBaseURL(value) {
  return value.trim().replace(/\/+$/, "");
}
function endpointURL(kind, baseURL, model) {
  if (kind === "gemini") {
    const full = baseURL.replace(/:generateContent$/i, ":streamGenerateContent");
    if (/:streamGenerateContent$/i.test(full)) return `${full}?alt=sse`;
    const versioned = /\/v1(?:alpha|beta)?$/i.test(baseURL) ? baseURL : `${baseURL}/v1beta`;
    return `${versioned}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  }
  if (kind === "anthropic") {
    if (/\/messages$/i.test(baseURL)) return baseURL;
    return /\/v1$/i.test(baseURL) ? `${baseURL}/messages` : `${baseURL}/v1/messages`;
  }
  const path = kind === "openai-responses" ? "/responses" : "/chat/completions";
  return baseURL.toLowerCase().endsWith(path) ? baseURL : `${baseURL}${path}`;
}
function jsonObjectOnly(baseURL) {
  try {
    return new URL(baseURL).hostname === "api.deepseek.com";
  } catch {
    return false;
  }
}
function validateProviderURL(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ProviderHostError("AGENT_PROVIDER_BASE_URL_INVALID");
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && process.env.ALPHA_AGENT_ALLOW_INSECURE_HTTP === "1")) {
    throw new ProviderHostError("AGENT_PROVIDER_TLS_REQUIRED");
  }
}
function positiveTimeout(value) {
  if (!Number.isFinite(value) || value < 1e3 || value > 6e5) throw new ProviderHostError("AGENT_PROVIDER_TIMEOUT_INVALID");
  return Math.trunc(value);
}
function emptyParsedTurn(responseId) {
  return {
    responseId,
    finishReason: "",
    toolCalls: [],
    assistantText: "",
    assistantReasoning: "",
    assistantBlocks: [],
    assistantParts: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }
  };
}
async function waitForToolResults(context, calls, timeoutMs) {
  const pending = Promise.all(calls.map((call) => context.waitForToolResults(call.toolCallId)));
  const batches = await awaitWithTurnControl(pending, context.signal, timeoutMs);
  const results = [];
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    const batch = batches[index] ?? [];
    const result = batch.find((candidate) => candidate.toolCallId === call.toolCallId && candidate.toolName === call.toolName);
    if (!result) throw new ProviderHostError("AGENT_PROVIDER_TOOL_RESULT_MISSING");
    results.push(result);
  }
  return results;
}
async function awaitWithTurnControl(promise, signal, timeoutMs) {
  if (signal.aborted) throw new TurnCanceledError();
  let timer;
  let abortHandler;
  const controlled = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new ProviderHostError("AGENT_PROVIDER_TOOL_RESULT_TIMEOUT", true)), timeoutMs);
    abortHandler = () => reject(new TurnCanceledError());
    signal.addEventListener("abort", abortHandler, { once: true });
    promise.then(resolve, reject);
  });
  try {
    return await controlled;
  } finally {
    if (timer) clearTimeout(timer);
    if (abortHandler) signal.removeEventListener("abort", abortHandler);
    void promise.catch(() => void 0);
  }
}
function createToolAccumulator(index, responseId) {
  return {
    index,
    toolCallId: `${responseId || "provider"}:tool:${index + 1}`,
    toolName: "",
    argumentFragments: "",
    argumentValue: void 0,
    hasArgumentValue: false,
    hasProviderToolCallId: false
  };
}
function getToolAccumulator(accumulators, key, index, responseId) {
  let accumulator = accumulators.get(key);
  if (!accumulator) {
    accumulator = createToolAccumulator(index, responseId);
    accumulators.set(key, accumulator);
  }
  return accumulator;
}
function appendArgumentFragment(accumulator, value) {
  if (typeof value === "string") {
    if (Buffer.byteLength(accumulator.argumentFragments + value, "utf8") > MAX_TOOL_ARGUMENT_BYTES) {
      throw new ProviderHostError("AGENT_PROVIDER_TOOL_ARGUMENTS_TOO_LARGE");
    }
    accumulator.argumentFragments += value;
    if (value.length > 0) accumulator.hasArgumentValue = false;
    return;
  }
  if (value !== void 0) {
    const encoded = stringifyCanonicalJson(value);
    if (Buffer.byteLength(encoded, "utf8") > MAX_TOOL_ARGUMENT_BYTES) {
      throw new ProviderHostError("AGENT_PROVIDER_TOOL_ARGUMENTS_TOO_LARGE");
    }
    accumulator.argumentValue = value;
    accumulator.hasArgumentValue = true;
  }
}
function finalizeToolCalls(accumulators, kind, responseId) {
  if (accumulators.size > MAX_TOOL_CALLS) {
    throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_LIMIT");
  }
  const calls = [...accumulators.values()].sort((left, right) => left.index - right.index).map((accumulator, index) => {
    const toolName = accumulator.toolName.trim();
    if (!toolName) throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
    const toolCallId = accumulator.toolCallId.trim() || `${kind}:${responseId || "response"}:tool:${index + 1}`;
    const argumentsValue = accumulator.hasArgumentValue ? accumulator.argumentValue : parseToolArguments(accumulator.argumentFragments);
    const argumentsJson = stringifyCanonicalJson(argumentsValue);
    if (Buffer.byteLength(argumentsJson, "utf8") > MAX_TOOL_ARGUMENT_BYTES) {
      throw new ProviderHostError("AGENT_PROVIDER_TOOL_ARGUMENTS_TOO_LARGE");
    }
    return {
      toolCallId,
      toolName,
      wireToolName: toolName,
      arguments: argumentsValue,
      argumentsJson,
      providerCallId: accumulator.hasProviderToolCallId
    };
  });
  assertUniqueToolCalls(calls);
  return calls;
}
function geminiToolParts(accumulators, calls) {
  const ordered = [...accumulators.values()].sort((left, right) => left.index - right.index);
  return calls.map((call, index) => {
    const accumulator = ordered[index];
    return {
      functionCall: {
        name: call.wireToolName,
        args: call.arguments,
        ...call.providerCallId ? { id: call.toolCallId } : {}
      },
      ...accumulator?.wirePart ?? {}
    };
  });
}
function parseToolArguments(value) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new ProviderHostError("AGENT_PROVIDER_TOOL_ARGUMENTS_INVALID");
  }
}
function getAnthropicBlock(blocks, order, index) {
  let block = blocks.get(index);
  if (!block) {
    block = {
      type: "",
      text: "",
      thinking: "",
      signature: "",
      toolCallId: "",
      toolName: "",
      argumentFragments: "",
      argumentValue: void 0,
      hasArgumentValue: false
    };
    blocks.set(index, block);
    order.push(index);
  }
  return block;
}
function finalizeAnthropicBlocks(source, order, responseId) {
  const calls = [];
  const blocks = [];
  for (const index of order) {
    const block = source.get(index);
    if (!block) continue;
    if (block.type === "tool_use" || block.toolName) {
      const toolName = block.toolName.trim();
      if (!toolName) throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
      const toolCallId = block.toolCallId.trim() || `anthropic:${responseId || "response"}:tool:${index + 1}`;
      const argumentsValue = block.hasArgumentValue ? block.argumentValue : parseToolArguments(block.argumentFragments);
      const argumentsJson = stringifyCanonicalJson(argumentsValue);
      if (Buffer.byteLength(argumentsJson, "utf8") > MAX_TOOL_ARGUMENT_BYTES) {
        throw new ProviderHostError("AGENT_PROVIDER_TOOL_ARGUMENTS_TOO_LARGE");
      }
      calls.push({
        toolCallId,
        toolName,
        wireToolName: toolName,
        arguments: argumentsValue,
        argumentsJson,
        providerCallId: block.toolCallId.trim().length > 0
      });
      blocks.push({ type: "tool_use", id: toolCallId, name: toolName, input: argumentsValue });
    } else if (block.type === "thinking" || block.thinking) {
      blocks.push({
        type: "thinking",
        thinking: block.thinking,
        ...block.signature ? { signature: block.signature } : {}
      });
    } else if (block.text) {
      blocks.push({ type: "text", text: block.text });
    }
  }
  if (calls.length > MAX_TOOL_CALLS) throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_LIMIT");
  assertUniqueToolCalls(calls);
  return { calls, blocks };
}
function assertUniqueToolCalls(calls) {
  const ids = /* @__PURE__ */ new Set();
  for (const call of calls) {
    if (!call.toolCallId || ids.has(call.toolCallId)) {
      throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
    }
    ids.add(call.toolCallId);
  }
}
function toolsToOpenAI(tools) {
  return tools.map((tool) => ({ type: "function", function: { name: tool.wireName, description: tool.description, parameters: tool.schema } }));
}
function toolsToResponses(tools) {
  return tools.map((tool) => ({ type: "function", name: tool.wireName, description: tool.description, parameters: tool.schema, strict: false }));
}
function toolsToAnthropic(tools) {
  return tools.map((tool) => ({ name: tool.wireName, description: tool.description, input_schema: tool.schema }));
}
function toolsToGemini(tools) {
  return [{ functionDeclarations: tools.map((tool) => ({ name: tool.wireName, description: tool.description, parametersJsonSchema: tool.schema })) }];
}
function finish(reasonCode, providerResponseId) {
  return { kind: "finish", value: { reasonCode, providerResponseId } };
}
function mergeUse(parsed, next) {
  const current = parsed.usage;
  parsed.usage = {
    inputTokens: Math.max(current.inputTokens, next.inputTokens),
    outputTokens: Math.max(current.outputTokens, next.outputTokens),
    cacheReadTokens: Math.max(current.cacheReadTokens, next.cacheReadTokens),
    cacheWriteTokens: Math.max(current.cacheWriteTokens, next.cacheWriteTokens),
    reasoningTokens: Math.max(current.reasoningTokens, next.reasoningTokens)
  };
}
function usageEvent(parsed, requestNumber, purpose = "") {
  return { kind: "usage", value: usageReported(parsed.usage, parsed.responseId || `request-${requestNumber}`, purpose) };
}
async function* readSSE(body, handle) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  try {
    while (true) {
      throwIfStreamInactive(handle);
      const result = await readStreamChunk(reader, handle);
      if (result.done) break;
      handle.touch();
      bytes += result.value.byteLength;
      if (bytes > MAX_EVENT_BYTES) throw new ProviderHostError("AGENT_PROVIDER_STREAM_TOO_LARGE");
      buffer += decoder.decode(result.value, { stream: true });
      const split = splitSSERecords(buffer);
      buffer = split.rest;
      for (const record3 of split.records) {
        const value2 = sseData(record3);
        if (value2) yield value2;
      }
    }
    buffer += decoder.decode();
    const value = sseData(buffer);
    if (value) yield value;
  } catch (error) {
    if (handle.timedOut() || Date.now() >= handle.deadline) throw new ProviderHostError("AGENT_PROVIDER_TIMEOUT", true);
    if (handle.signal.aborted || isAbortError(error)) throw new TurnCanceledError();
    if (error instanceof ProviderHostError) throw error;
    throw new ProviderHostError("AGENT_PROVIDER_STREAM_FAILED", true);
  } finally {
    try {
      await reader.cancel();
    } catch {
    }
    reader.releaseLock();
  }
}
async function readStreamChunk(reader, handle) {
  const { signal } = handle;
  const remaining = handle.deadline - Date.now();
  if (remaining <= 0) throw new ProviderHostError("AGENT_PROVIDER_TIMEOUT", true);
  let timer;
  let abortHandler;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new ProviderHostError("AGENT_PROVIDER_TIMEOUT", true)), remaining);
  });
  const aborted = new Promise((_resolve, reject) => {
    abortHandler = () => reject(handle.timedOut() ? new ProviderHostError("AGENT_PROVIDER_TIMEOUT", true) : new TurnCanceledError());
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  try {
    return await Promise.race([reader.read(), timeout, aborted]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abortHandler) signal.removeEventListener("abort", abortHandler);
    throwIfStreamInactive(handle);
  }
}
function splitSSERecords(buffer) {
  const records = [];
  let cursor = 0;
  const separator = /\r?\n\r?\n/g;
  for (let match = separator.exec(buffer); match; match = separator.exec(buffer)) {
    records.push(buffer.slice(cursor, match.index));
    cursor = match.index + match[0].length;
  }
  return { records, rest: buffer.slice(cursor) };
}
function sseData(record3) {
  return record3.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim();
}
function parseEvent(payload) {
  let value;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new ProviderHostError("AGENT_PROVIDER_EVENT_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderHostError("AGENT_PROVIDER_EVENT_INVALID");
  }
  const record3 = value;
  const plan = planError(recordValue(record3, "error") ?? record3);
  if (record3.error != null || record3.type === "error") throw new ProviderHostError(plan?.code ?? "AGENT_PROVIDER_RESPONSE_ERROR", plan ? plan.retryable : streamErrorTransient(record3));
  return record3;
}
function recordValue(value, key) {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? value[key] : void 0;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : void 0;
}
function arrayValue(value) {
  return Array.isArray(value) ? value.filter((item) => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}
function stringValue(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
function textValue(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((part) => {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object" || Array.isArray(part)) return "";
    const record3 = part;
    return typeof record3.text === "string" ? record3.text : "";
  }).join("");
}
function integerValue(value, fallback) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}
function isAbortError(error) {
  return error instanceof DOMException ? error.name === "AbortError" : Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}
function isToolFinishReason(kind, reason) {
  const normalized = reason.trim().toLowerCase();
  if (kind === "anthropic") return normalized === "tool_use";
  if (kind === "gemini" || kind === "openai-responses") return normalized === "function_call" || normalized === "tool_calls";
  return normalized === "tool_calls" || normalized === "function_call";
}
function throwIfRequestInactive(handle, turnSignal) {
  if (turnSignal.aborted) throw new TurnCanceledError();
  if (handle.timedOut() || Date.now() >= handle.deadline) {
    throw new ProviderHostError("AGENT_PROVIDER_TIMEOUT", true);
  }
  if (handle.signal.aborted) throw new TurnCanceledError();
}
function throwIfStreamInactive(handle) {
  if (handle.timedOut() || Date.now() >= handle.deadline) throw new ProviderHostError("AGENT_PROVIDER_TIMEOUT", true);
  if (handle.signal.aborted) throw new TurnCanceledError();
}

// src/provider/configured-providers.ts
function configuredProviders() {
  return [new FixtureProvider(), ...createConfiguredProviders()];
}

// src/host/agent-host-runtime.ts
var PROTOCOL_MAJOR = 1;
var PROTOCOL_MINOR = 0;
var AgentHostRuntime = class {
  providers = /* @__PURE__ */ new Map();
  turns = /* @__PURE__ */ new Map();
  terminalKeys = [];
  maxConcurrentTurns;
  maxRetainedTurns;
  constructor(providers = configuredProviders(), limits = {}) {
    this.maxConcurrentTurns = positiveInteger(limits.maxConcurrentTurns ?? 32, "maxConcurrentTurns");
    this.maxRetainedTurns = positiveInteger(limits.maxRetainedTurns ?? 1024, "maxRetainedTurns");
    for (const provider of providers) {
      if (this.providers.has(provider.kind)) throw new Error("AGENT_PROVIDER_KIND_DUPLICATE");
      this.providers.set(provider.kind, provider);
    }
  }
  hello(request) {
    if (request.protocolMajor !== PROTOCOL_MAJOR) {
      throw new ProviderHostError("AGENT_PROTOCOL_MAJOR_UNSUPPORTED");
    }
    return {
      protocolMajor: PROTOCOL_MAJOR,
      protocolMinor: Math.min(PROTOCOL_MINOR, request.protocolMinor),
      hostBuildId: "alpha-agent-host/0.1.0",
      providerKinds: [...this.providers.keys()].sort(),
      nonce: request.nonce
    };
  }
  async runTurn(request, emit) {
    if (request.runId.length === 0 || request.turnId.length === 0) {
      await emit(detachedFailureEvent(request, "AGENT_TURN_IDENTITY_INVALID", false));
      return;
    }
    const key = turnKey(request.runId, request.turnId);
    const existing = this.turns.get(key);
    if (existing) {
      await emit(this.failureEvent(existing, "AGENT_TURN_ALREADY_EXISTS", false, true));
      return;
    }
    if (this.activeTurnCount() >= this.maxConcurrentTurns) {
      await emit(detachedFailureEvent(request, "AGENT_HOST_BUSY", true));
      return;
    }
    const record3 = {
      runId: request.runId,
      turnId: request.turnId,
      state: "starting",
      nextEventSeq: 1n,
      controller: new AbortController(),
      toolGates: /* @__PURE__ */ new Map()
    };
    this.turns.set(key, record3);
    const providerKind = request.provider?.providerKind ?? "";
    const provider = this.providers.get(providerKind);
    if (!provider) {
      this.finishTurn(record3, "failed");
      await emit(this.failureEvent(record3, "AGENT_PROVIDER_UNSUPPORTED", false, false));
      return;
    }
    record3.state = "running";
    try {
      const stream = provider.runTurn({
        request,
        signal: record3.controller.signal,
        waitForToolResults: (toolCallId) => this.waitForToolResults(record3, toolCallId)
      });
      for await (const payload of stream) {
        if (record3.controller.signal.aborted) throw new TurnCanceledError();
        if (payload.kind === "toolCall") this.prepareToolGate(record3, payload.value.toolCallId, payload.value.toolName);
        if (payload.kind === "finish") {
          if ([...record3.toolGates.values()].some((gate) => !gate.deferred.isSettled)) {
            throw new ProviderHostError("AGENT_PROVIDER_FINISHED_WITH_PENDING_TOOLS");
          }
          this.finishTurn(record3, "completed");
        }
        await emitProviderEvent(emit, this.providerEvent(record3, payload));
        if (payload.kind === "finish") {
          return;
        }
        if (record3.controller.signal.aborted) throw new TurnCanceledError();
      }
      throw new ProviderHostError("AGENT_PROVIDER_FINISH_MISSING");
    } catch (error) {
      if (error instanceof EventEmissionError) throw error.cause;
      if (record3.controller.signal.aborted || error instanceof TurnCanceledError) {
        this.finishTurn(record3, "canceled");
        await emit(this.failureEvent(record3, "AGENT_TURN_CANCELED", false, true));
        return;
      }
      const failure = normalizeProviderError(error);
      this.finishTurn(record3, "failed");
      await emit(this.failureEvent(record3, failure.code, failure.retryable, true));
    }
  }
  cancelTurn(request) {
    const record3 = this.turns.get(turnKey(request.runId, request.turnId));
    if (!record3 || isTerminal(record3.state) || record3.state === "cancel_requested") {
      return { cancellationRequested: false };
    }
    record3.state = "cancel_requested";
    record3.controller.abort(new TurnCanceledError());
    for (const gate of record3.toolGates.values()) gate.deferred.reject(new TurnCanceledError());
    return { cancellationRequested: true };
  }
  submitToolResults(request) {
    const record3 = this.turns.get(turnKey(request.runId, request.turnId));
    if (!record3 || record3.state !== "waiting_tool" || request.results.length === 0) {
      return { accepted: false };
    }
    const submittedIds = /* @__PURE__ */ new Set();
    const submissions = request.results.map((result) => ({ result, gate: record3.toolGates.get(result.toolCallId) }));
    const matchesExpectedCalls = submissions.every(({ result, gate }) => {
      if (!gate || gate.deferred.isSettled || gate.toolName !== result.toolName || submittedIds.has(result.toolCallId)) {
        return false;
      }
      submittedIds.add(result.toolCallId);
      return true;
    });
    if (!matchesExpectedCalls) return { accepted: false };
    for (const { result, gate } of submissions) gate?.deferred.resolve([result]);
    if ([...record3.toolGates.values()].every((gate) => gate.deferred.isSettled)) record3.state = "running";
    return { accepted: true };
  }
  getTurnState(runId, turnId) {
    return this.turns.get(turnKey(runId, turnId))?.state;
  }
  cancelAll(reasonCode) {
    for (const record3 of this.turns.values()) {
      if (isTerminal(record3.state) || record3.state === "cancel_requested") continue;
      this.cancelTurn({ runId: record3.runId, turnId: record3.turnId, reasonCode });
    }
  }
  activeTurnCount() {
    let count2 = 0;
    for (const record3 of this.turns.values()) {
      if (!isTerminal(record3.state)) count2 += 1;
    }
    return count2;
  }
  finishTurn(record3, state) {
    record3.state = state;
    record3.toolGates.clear();
    const key = turnKey(record3.runId, record3.turnId);
    this.terminalKeys.push(key);
    while (this.terminalKeys.length > this.maxRetainedTurns) {
      const expiredKey = this.terminalKeys.shift();
      if (expiredKey) this.turns.delete(expiredKey);
    }
  }
  prepareToolGate(record3, toolCallId, toolName) {
    if (record3.toolGates.has(toolCallId) || toolCallId.length === 0 || toolName.length === 0) {
      throw new ProviderHostError("AGENT_PROVIDER_TOOL_CALL_INVALID");
    }
    record3.toolGates.set(toolCallId, { toolCallId, toolName, deferred: new Deferred() });
    record3.state = "waiting_tool";
  }
  async waitForToolResults(record3, toolCallId) {
    const gate = record3.toolGates.get(toolCallId);
    if (!gate) {
      throw new ProviderHostError("AGENT_TOOL_RESULT_BOUNDARY_INVALID");
    }
    try {
      return await gate.deferred.promise;
    } finally {
      record3.toolGates.delete(toolCallId);
      if (record3.state === "waiting_tool" && record3.toolGates.size === 0) record3.state = "running";
    }
  }
  providerEvent(record3, payload) {
    const event = {
      runId: record3.runId,
      turnId: record3.turnId,
      eventSeq: record3.nextEventSeq++
    };
    switch (payload.kind) {
      case "textDelta":
        event.textDelta = payload.value;
        break;
      case "reasoningDelta":
        event.reasoningDelta = payload.value;
        break;
      case "toolCall":
        event.toolCall = payload.value;
        break;
      case "usage":
        event.usage = payload.value;
        break;
      case "retry":
        event.retry = payload.value;
        break;
      case "compaction":
        event.compaction = payload.value;
        break;
      case "finish":
        event.finish = payload.value;
        break;
    }
    return event;
  }
  failureEvent(record3, code, retryable, contextMayBeResumable) {
    return {
      runId: record3.runId,
      turnId: record3.turnId,
      eventSeq: record3.nextEventSeq++,
      failure: {
        error: alphaError(code, retryable),
        contextMayBeResumable
      }
    };
  }
};
var Deferred = class {
  promise;
  resolvePromise;
  rejectPromise;
  settled = false;
  get isSettled() {
    return this.settled;
  }
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
    void this.promise.catch(() => void 0);
  }
  resolve(value) {
    if (this.settled) return;
    this.settled = true;
    this.resolvePromise(value);
  }
  reject(error) {
    if (this.settled) return;
    this.settled = true;
    this.rejectPromise(error);
  }
};
var EventEmissionError = class extends Error {
  cause;
  constructor(cause) {
    super("AGENT_HOST_EVENT_EMISSION_FAILED");
    this.name = "EventEmissionError";
    this.cause = cause;
  }
};
function alphaError(code, retryable) {
  return {
    code,
    category: retryable ? "transient" : "permanent",
    retryable,
    userMessageKey: `agent.${code.toLowerCase()}`,
    diagnosticId: "",
    details: []
  };
}
function normalizeProviderError(error) {
  if (error instanceof ProviderHostError) return error;
  return new ProviderHostError("AGENT_PROVIDER_INTERNAL", true);
}
function detachedFailureEvent(request, code, retryable) {
  return {
    runId: request.runId,
    turnId: request.turnId,
    eventSeq: 1n,
    failure: {
      error: alphaError(code, retryable),
      contextMayBeResumable: false
    }
  };
}
async function emitProviderEvent(emit, event) {
  try {
    await emit(event);
  } catch (error) {
    throw new EventEmissionError(error);
  }
}
function turnKey(runId, turnId) {
  return `${runId.length}:${runId}${turnId}`;
}
function isTerminal(state) {
  return state === "canceled" || state === "completed" || state === "failed";
}
function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${field} must be a positive integer`);
  return value;
}

// src/transport/framing.ts
var LENGTH_PREFIX_BYTES = 4;
var RECORD_HEADER_BYTES = 6;
var MAX_RECORD_BODY_BYTES = 16 * 1024 * 1024;
var FrameKind = /* @__PURE__ */ ((FrameKind2) => {
  FrameKind2[FrameKind2["Request"] = 1] = "Request";
  FrameKind2[FrameKind2["UnaryResponse"] = 2] = "UnaryResponse";
  FrameKind2[FrameKind2["StreamItem"] = 3] = "StreamItem";
  FrameKind2[FrameKind2["StreamEnd"] = 4] = "StreamEnd";
  return FrameKind2;
})(FrameKind || {});
var AgentHostMethod = /* @__PURE__ */ ((AgentHostMethod2) => {
  AgentHostMethod2[AgentHostMethod2["Hello"] = 1] = "Hello";
  AgentHostMethod2[AgentHostMethod2["RunTurn"] = 2] = "RunTurn";
  AgentHostMethod2[AgentHostMethod2["CancelTurn"] = 3] = "CancelTurn";
  AgentHostMethod2[AgentHostMethod2["SubmitToolResults"] = 4] = "SubmitToolResults";
  return AgentHostMethod2;
})(AgentHostMethod || {});
var FrameProtocolError = class extends Error {
  code;
  constructor(code) {
    super(code);
    this.name = "FrameProtocolError";
    this.code = code;
  }
};
function encodeRawFrame(frame) {
  validateKind(frame.kind);
  validateMethod(frame.method);
  validateRequestId(frame.requestId);
  const bodyLength = RECORD_HEADER_BYTES + frame.payload.byteLength;
  if (bodyLength > MAX_RECORD_BODY_BYTES) throw new FrameProtocolError("FRAME_TOO_LARGE");
  const encoded = Buffer.allocUnsafe(LENGTH_PREFIX_BYTES + bodyLength);
  encoded.writeUInt32BE(bodyLength, 0);
  encoded.writeUInt8(frame.kind, LENGTH_PREFIX_BYTES);
  encoded.writeUInt8(frame.method, LENGTH_PREFIX_BYTES + 1);
  encoded.writeUInt32BE(frame.requestId, LENGTH_PREFIX_BYTES + 2);
  encoded.set(frame.payload, LENGTH_PREFIX_BYTES + RECORD_HEADER_BYTES);
  return encoded;
}
var AgentHostFrameDecoder = class {
  buffer = Buffer.alloc(0);
  push(chunk) {
    if (chunk.byteLength === 0) return [];
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames = [];
    while (this.buffer.byteLength >= LENGTH_PREFIX_BYTES) {
      const bodyLength = this.buffer.readUInt32BE(0);
      if (bodyLength > MAX_RECORD_BODY_BYTES) {
        this.buffer = Buffer.alloc(0);
        throw new FrameProtocolError("FRAME_TOO_LARGE");
      }
      if (bodyLength < RECORD_HEADER_BYTES) {
        this.buffer = Buffer.alloc(0);
        throw new FrameProtocolError("FRAME_TOO_SHORT");
      }
      const encodedLength = LENGTH_PREFIX_BYTES + bodyLength;
      if (this.buffer.byteLength < encodedLength) break;
      const body = this.buffer.subarray(LENGTH_PREFIX_BYTES, encodedLength);
      const kind = body.readUInt8(0);
      const method = body.readUInt8(1);
      const requestId = body.readUInt32BE(2);
      validateKind(kind);
      validateMethod(method);
      validateRequestId(requestId);
      frames.push({
        kind,
        method,
        requestId,
        payload: body.subarray(RECORD_HEADER_BYTES)
      });
      this.buffer = this.buffer.subarray(encodedLength);
    }
    return frames;
  }
  finish() {
    if (this.buffer.byteLength === 0) return;
    this.buffer = Buffer.alloc(0);
    throw new FrameProtocolError("FRAME_TRUNCATED");
  }
};
function validateKind(kind) {
  if (!Object.values(FrameKind).includes(kind)) throw new FrameProtocolError("FRAME_KIND_INVALID");
}
function validateMethod(method) {
  if (!Object.values(AgentHostMethod).includes(method)) throw new FrameProtocolError("FRAME_METHOD_INVALID");
}
function validateRequestId(requestId) {
  if (!Number.isInteger(requestId) || requestId < 1 || requestId > 4294967295) {
    throw new FrameProtocolError("FRAME_REQUEST_ID_INVALID");
  }
}

// src/transport/codec.ts
function decodeAgentHostRequest(frame) {
  if (frame.kind !== 1 /* Request */) throw new Error("AGENT_HOST_EXPECTED_REQUEST_FRAME");
  switch (frame.method) {
    case 1 /* Hello */:
      return {
        method: frame.method,
        requestId: frame.requestId,
        message: AgentHostHelloRequest.decode(frame.payload)
      };
    case 2 /* RunTurn */:
      return {
        method: frame.method,
        requestId: frame.requestId,
        message: RunModelTurnRequest.decode(frame.payload)
      };
    case 3 /* CancelTurn */:
      return {
        method: frame.method,
        requestId: frame.requestId,
        message: CancelModelTurnRequest.decode(frame.payload)
      };
    case 4 /* SubmitToolResults */:
      return {
        method: frame.method,
        requestId: frame.requestId,
        message: SubmitToolResultsRequest.decode(frame.payload)
      };
  }
}
function encodeAgentHostOutput(output) {
  if (output.kind === 4 /* StreamEnd */) {
    return { ...output, payload: new Uint8Array() };
  }
  let payload;
  switch (output.method) {
    case 1 /* Hello */:
      payload = AgentHostHelloResponse.encode(output.message).finish();
      break;
    case 2 /* RunTurn */:
      payload = ProviderEvent.encode(output.message).finish();
      break;
    case 3 /* CancelTurn */:
      payload = CancelModelTurnResponse.encode(output.message).finish();
      break;
    case 4 /* SubmitToolResults */:
      payload = SubmitToolResultsResponse.encode(output.message).finish();
      break;
  }
  return { kind: output.kind, method: output.method, requestId: output.requestId, payload };
}

// src/transport/frame-writer.ts
var AgentHostFrameWriter = class {
  constructor(output) {
    this.output = output;
  }
  output;
  tail = Promise.resolve();
  write(frame) {
    const bytes = encodeRawFrame(frame);
    const operation = this.tail.then(() => writeBytes(this.output, bytes));
    this.tail = operation.catch(() => void 0);
    return operation;
  }
};
function writeBytes(output, bytes) {
  return new Promise((resolve, reject) => {
    output.write(bytes, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

// src/host/agent-host-server.ts
async function serveAgentHost(input, output, runtime = new AgentHostRuntime(), shutdownGraceMs = 1500) {
  if (!Number.isSafeInteger(shutdownGraceMs) || shutdownGraceMs < 1) {
    throw new RangeError("shutdownGraceMs must be a positive integer");
  }
  const decoder = new AgentHostFrameDecoder();
  const writer = new AgentHostFrameWriter(output);
  const background = /* @__PURE__ */ new Set();
  let helloComplete = false;
  let backgroundError;
  const track2 = (task) => {
    background.add(task);
    void task.then(
      () => background.delete(task),
      (error) => {
        background.delete(task);
        backgroundError = error instanceof Error ? error : new Error("AGENT_HOST_BACKGROUND_FAILED");
        input.destroy(backgroundError);
      }
    );
  };
  try {
    for await (const chunk of input) {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
      for (const rawFrame of decoder.push(bytes)) {
        const request = decodeAgentHostRequest(rawFrame);
        if (request.method !== 1 /* Hello */ && !helloComplete) {
          throw new Error("AGENT_HOST_HELLO_REQUIRED");
        }
        switch (request.method) {
          case 1 /* Hello */: {
            const message = runtime.hello(request.message);
            helloComplete = true;
            await writer.write(
              encodeAgentHostOutput({
                kind: 2 /* UnaryResponse */,
                method: request.method,
                requestId: request.requestId,
                message
              })
            );
            break;
          }
          case 2 /* RunTurn */: {
            const task = runtime.runTurn(
              request.message,
              (message) => writer.write(
                encodeAgentHostOutput({
                  kind: 3 /* StreamItem */,
                  method: 2 /* RunTurn */,
                  requestId: request.requestId,
                  message
                })
              )
            ).then(
              () => writer.write(
                encodeAgentHostOutput({
                  kind: 4 /* StreamEnd */,
                  method: 2 /* RunTurn */,
                  requestId: request.requestId
                })
              )
            );
            track2(task);
            break;
          }
          case 3 /* CancelTurn */: {
            const message = runtime.cancelTurn(request.message);
            await writer.write(
              encodeAgentHostOutput({
                kind: 2 /* UnaryResponse */,
                method: request.method,
                requestId: request.requestId,
                message
              })
            );
            break;
          }
          case 4 /* SubmitToolResults */: {
            const message = runtime.submitToolResults(request.message);
            await writer.write(
              encodeAgentHostOutput({
                kind: 2 /* UnaryResponse */,
                method: request.method,
                requestId: request.requestId,
                message
              })
            );
            break;
          }
        }
      }
    }
    decoder.finish();
  } finally {
    runtime.cancelAll("engine_disconnected");
    const settled = await settleWithin(background, shutdownGraceMs);
    if (!settled) throw new Error("AGENT_HOST_SHUTDOWN_TIMEOUT");
  }
  if (backgroundError) throw backgroundError;
}
async function settleWithin(tasks, timeoutMs) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([Promise.allSettled([...tasks]).then(() => true), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// src/index.ts
void serveAgentHost(process.stdin, process.stdout).catch((error) => {
  const code = error instanceof Error ? error.message : "AGENT_HOST_FATAL";
  const forceExit = setTimeout(() => process.exit(1), 250);
  process.stderr.write(`alpha-agent-host: ${code}
`, () => {
    clearTimeout(forceExit);
    process.exit(1);
  });
});
//# sourceMappingURL=index.cjs.map
