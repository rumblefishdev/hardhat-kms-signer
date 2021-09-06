import Common from "@ethereumjs/common";
import * as asn1 from "asn1.js";
import { KMS } from "aws-sdk";
import * as EthUtil from "ethereumjs-util";

export const kms = new KMS();

export interface SignParams {
  keyId: KMS.SignRequest["KeyId"];
  message: Buffer;
}

export type CreateSignatureParams = SignParams & {
  address: string;
  txOpts?: Common;
};

const EcdsaSigAsnParse = asn1.define<{ r: EthUtil.BN; s: EthUtil.BN }>(
  "EcdsaSig",
  function (this: any) {
    this.seq().obj(this.key("r").int(), this.key("s").int());
  }
);

const EcdsaPubKey = asn1.define<{ pubKey: { data: Buffer } }>(
  "EcdsaPubKey",
  function (this: any) {
    this.seq().obj(
      this.key("algo").seq().obj(this.key("a").objid(), this.key("b").objid()),
      this.key("pubKey").bitstr()
    );
  }
);

export const recoverPubKeyFromSig = (
  msg: Buffer,
  r: EthUtil.BN,
  s: EthUtil.BN,
  v: number,
  chainId?: number | undefined
) => {
  const rBuffer = r.toBuffer();
  const sBuffer = s.toBuffer();
  const pubKey = EthUtil.ecrecover(msg, v, rBuffer, sBuffer, chainId);
  const addrBuf = EthUtil.pubToAddress(pubKey);
  const RecoveredEthAddr = EthUtil.bufferToHex(addrBuf);

  return RecoveredEthAddr;
};

const getRS = async (signParams: SignParams) => {
  const signature = await sign(signParams);

  if (signature.Signature === undefined) {
    throw new Error("Signature is undefined.");
  }
  const decoded = EcdsaSigAsnParse.decode(signature.Signature as string, "der");

  const r = decoded.r;
  let s = decoded.s;

  const secp256k1N = new EthUtil.BN(
    "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
    16
  );
  const secp256k1halfN = secp256k1N.div(new EthUtil.BN(2));

  if (s.gt(secp256k1halfN)) {
    s = secp256k1N.sub(s);
    return { r, s };
  }

  return { r, s };
};

const getV = (
  msg: Buffer,
  r: EthUtil.BN,
  s: EthUtil.BN,
  expectedEthAddr: string
) => {
  let v = 27;
  let pubKey = recoverPubKeyFromSig(msg, r, s, v);
  if (pubKey !== expectedEthAddr) {
    v = 28;
    pubKey = recoverPubKeyFromSig(msg, r, s, v);
  }
  return new EthUtil.BN(v - 27);
};

export const getEthAddressFromPublicKey = (
  publicKey: KMS.PublicKeyType
): string => {
  const res = EcdsaPubKey.decode(publicKey as string, "der");
  let pubKeyBuffer: Buffer = res.pubKey.data;

  pubKeyBuffer = pubKeyBuffer.slice(1, pubKeyBuffer.length);

  const address = EthUtil.keccak256(pubKeyBuffer);
  const EthAddr = "0x" + address.slice(-20).toString("hex");

  return EthAddr;
};

export const getPublicKey = (KeyId: KMS.GetPublicKeyRequest["KeyId"]) =>
  kms.getPublicKey({ KeyId }).promise();

export const getEthAddressFromKMS = async (
  keyId: KMS.GetPublicKeyRequest["KeyId"]
) => {
  const KMSKey = await getPublicKey(keyId);
  if (!KMSKey.PublicKey) {
    throw new Error("Failed to get PublicKey from KMS");
  }
  return getEthAddressFromPublicKey(KMSKey.PublicKey);
};

export const sign = (signParams: SignParams) => {
  const { keyId, message } = signParams;

  return kms
    .sign({
      KeyId: keyId,
      Message: message,
      SigningAlgorithm: "ECDSA_SHA_256",
      MessageType: "DIGEST",
    })
    .promise();
};

export const createSignature = async (sigParams: CreateSignatureParams) => {
  const { keyId, message, address } = sigParams;

  const { r, s } = await getRS({ keyId, message });
  const v = getV(message, r, s, address);

  return {
    r: r.toBuffer(),
    s: s.toBuffer(),
    v,
  };
};
