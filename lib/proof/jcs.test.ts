import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/proof/jcs";

describe("JCS canonicalize (RFC 8785)", () => {
  it("matches RFC 8785 §5.1 canonical example", () => {
    const input = {
      numbers: [
        333333333.33333329, 1e30, 4.5, 2e-3, 0.000000000000000000000000001,
      ],
      string: "",
      literals: [null, true, false],
    };
    expect(canonicalize(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":""}'
    );
  });

  it("escapes only required characters and emits lone surrogates as-is (RFC 8785)", () => {
    expect(canonicalize({ b: "\u0001", a: "\uDEAD" })).toBe(
      '{"a":"\uDEAD","b":"\\u0001"}'
    );
  });

  it("sorts object keys by UTF-16 code unit order", () => {
    const input: Record<string, number> = {
      aa: 1,
      "\u00E9": 2,
      "\u0000": 3,
      "\uFFFF": 4,
    };
    expect(canonicalize(input)).toBe(
      '{"\\u0000":3,"aa":1,"\u00E9":2,"\uFFFF":4}'
    );
  });

  it("is deterministic regardless of key insertion order and -0", () => {
    const a = { b: [1, 2, { d: true, c: null }], a: -0 };
    const b = { a: 0, b: [1, 2, { c: null, d: true }] };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalize(a)).toBe('{"a":0,"b":[1,2,{"c":null,"d":true}]}');
  });

  it("escapes quotes, backslashes and control chars in strings", () => {
    expect(canonicalize({ s: 'a"b\\c\nd\te\ff\rg' })).toBe(
      '{"s":"a\\"b\\\\c\\nd\\te\\ff\\rg"}'
    );
  });

  it("rejects non-finite numbers, BigInt and undefined (fail-closed)", () => {
    expect(() => canonicalize({ n: NaN })).toThrow(/finite/);
    expect(() => canonicalize({ n: Infinity })).toThrow(/finite/);
    expect(() => canonicalize({ n: BigInt(1) })).toThrow(/BigInt/);
    expect(() => canonicalize({ u: undefined })).toThrow(/unsupported/);
  });
});
