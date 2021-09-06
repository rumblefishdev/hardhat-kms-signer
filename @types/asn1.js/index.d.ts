declare module "asn1.js" {
  export class AsnObject<T> {
    public decode(body: Uint8Array | string | Buffer, type: string): T;
  }

  function define<T>(name: string, creator: () => void): AsnObject<T>;
}
