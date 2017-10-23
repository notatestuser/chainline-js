import ecurve from 'ecurve'
import BigInteger from 'bigi'
import { ec as EC } from 'elliptic'
import CryptoJS from 'crypto-js'
import WIF from 'wif'
import {
  hexstring2ab,
  ab2hexstring,
  reverseHex
} from './utils'
import secureRandom from 'secure-random'

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
let base58 = require('base-x')(BASE58)

/**
 * @typedef {Object} Account
 * @property {string} privateKey The private key in hex
 * @property {string} publicKeyEncoded The public key in encoded form
 * @property {string} publicKeyHash Hash of the public key
 * @property {string} programHash Program Hash to use for signing
 * @property {string} address Public address of the private key
 */

export const addressToScriptHash = (address) => {
  return ab2hexstring(base58.decode(address).slice(1, 21))
}

/**
 * Constructs a signed transaction.
 * @param {string} txData - Unsigned serialized transaction.
 * @param {string} sign - Signature obtained from signatureData.
 * @param {string} publicKeyEncoded - Public key in encoded form.
 * @return {string} A signed transaction ready to be sent over RPC.
 */
export const addContract = (txData, sign, publicKeyEncoded) => {
  let signatureScript = createChainLineWalletScript(publicKeyEncoded)
  // console.log(signatureScript);
  // sign num
  let data = txData + '01'
  // sign struct len
  data = data + '41'
  // sign data len
  data = data + '40'
  // sign data
  data = data + sign
  // Contract data len
  data = data + '23'
  // script data
  data = data + signatureScript
  // console.log(data);
  return data
}

/**
 * Create a signature script
 * @param {string|ArrayBuffer} publicKeyEncoded - Public Key in encoded form
 * @return {string} The signature script
 */
export const createSignatureScript = (publicKeyEncoded) => {
  if (publicKeyEncoded instanceof ArrayBuffer) publicKeyEncoded = publicKeyEncoded.toString('hex')
  return '21' + publicKeyEncoded + 'ac'
}

/**
 * Create a Chain Line wallet verify script
 * @param {string|ArrayBuffer} publicKeyEncoded - Public Key in encoded form
 * @return {string} The Chain Line wallet script
 */
export const createChainLineWalletScript = (publicKeyEncoded) => {
  if (publicKeyEncoded instanceof ArrayBuffer) publicKeyEncoded = publicKeyEncoded.toString('hex')
  // wallet revision a6e6bc6a503123fac7542efcbb26da3ab5b01efc
  return '5fc56b6a51527ac46a51c34c097369676e61747572656175754c21' + publicKeyEncoded +
      '6a52527ac44c20e72d286979ee6cb103e65dfddfb2e384100b8d148e7758de42e4168b71792c606' +
      'a53527ac4616168164e656f2e52756e74696d652e4765745472696767657261619c5186009c6307' +
      '00006c75666a51c36a52c361617c65ed01009e630800006c75666161682953797374656d2e45786' +
      '5637574696f6e456e67696e652e476574536372697074436f6e7461696e65726a54527ac4616168' +
      '2d53797374656d2e457865637574696f6e456e67696e652e476574457865637574696e675363726' +
      '97074486173686a55527ac46a54c376009e630500616161681a4e656f2e5472616e73616374696f' +
      '6e2e4765744f7574707574736a56527ac4006a5d527ac46a56c36a57527ac4006a58527ac46a58c' +
      '36a57c3c0a26397006a57c36a58c3c36a59527ac46a59c36a5a527ac46a5ac3616168184e656f2e' +
      '4f75747075742e476574536372697074486173686a55c3619c009c634c006a5ac3616168154e656' +
      'f2e4f75747075742e476574417373657449646a53c3619c009c6326006a5dc36a5ac3616168134e' +
      '656f2e4f75747075742e47657456616c7565936a5d527ac4616a58c351936a58527ac46264ff616' +
      'a5dc300948d00a1638b006a56c300c3616168184e656f2e4f75747075742e476574536372697074' +
      '486173686a57527ac44c1377616c6c65745f7265717565737454784f757454c576006a51c3c4765' +
      '16a52c3c476526a57c3764c09726563697069656e74617575c476536a5dc361c461617c6730a2b0' +
      '4139d714564eb956896498616cf8acc8db6a58527ac46a58c36c7566516c75666153c56b6a00527' +
      'ac46a51527ac46a00c36a51c361ac6c756661'
}

/**
 * Encodes Private Key into WIF
 * @param {ArrayBuffer} privateKey - Private Key
 * @returns {string} WIF key
 */
export const getWIFFromPrivateKey = (privateKey) => {
  const hexKey = ab2hexstring(privateKey)
  return WIF.encode(128, Buffer.from(hexKey, 'hex'), true)
}

/**
 * Generates a random private key
 * @returns {ArrayBuffer} An ArrayBuffer of 32 bytes
 */
export const generatePrivateKey = () => {
  return secureRandom(32)
}

export const generateRandomArray = ($arrayLen) => {
  return secureRandom($arrayLen)
}

/**
 * Get Account from Private Key
 * @param {string} privateKey - Private Key
 * @returns {Account} An Account object
 */
export const getAccountFromPrivateKey = (privateKey) => {
  if (privateKey.length !== 64) {
    return -1
  }
  const publicKeyEncoded = getPublicKey(privateKey, true)
  // console.log(publicKeyEncoded)
  return getAccountFromPublicKey(ab2hexstring(publicKeyEncoded), privateKey)
}

/**
 * Get Account from Public Key
 * @param {string} publicKeyEncoded - Public Key in encoded form
 * @param {string} privateKey - Private Key (optional)
 * @returns {Account} An Account object
 */
export const getAccountFromPublicKey = (publicKeyEncoded, privateKey) => {
  if (!verifyPublicKeyEncoded(publicKeyEncoded)) {
    // verify failed.
    return -1
  }
  const publicKeyHash = getHash(publicKeyEncoded)
  // console.log(publicKeyHash)

  const script = createChainLineWalletScript(publicKeyEncoded)
  // console.log(script)

  const programHash = getHash(script)
  // console.log(programHash)

  const address = toAddress(hexstring2ab(programHash))
  // console.log(address)

  return { privateKey, publicKeyEncoded, publicKeyHash, programHash, address }
}

/**
 * Get Account from WIF
 * @param {string} WIFKey - WIF Key
 * @returns {Account|number} An Account object or -1 for basic encoding errors, -2 for failed verification of WIF
 */
export const getAccountFromWIFKey = (WIFKey) => {
  let privateKey = getPrivateKeyFromWIF(WIFKey)
  if (privateKey === -1 || privateKey === -2) {
    return privateKey
  }
  return getAccountFromPrivateKey(privateKey)
}

/**
 * Get hash of string input
 * @param {string} signatureScript - String input
 * @returns {string} Hashed output
 */
export const getHash = (signatureScript) => {
  let ProgramHexString = CryptoJS.enc.Hex.parse(signatureScript)
  let ProgramSha256 = CryptoJS.SHA256(ProgramHexString)
  return CryptoJS.RIPEMD160(ProgramSha256).toString()
}

/**
 * Get private key from WIF key.
 * @param {string} wif - WIF key
 * @return {string} Private key
 */
export const getPrivateKeyFromWIF = (wif) => {
  let data = base58.decode(wif)

  if (data.length !== 38 || data[0] !== 0x80 || data[33] !== 0x01) {
    // basic encoding errors
    return -1
  }

  let dataHexString = CryptoJS.enc.Hex.parse(ab2hexstring(data.slice(0, data.length - 4)))
  let dataSha = CryptoJS.SHA256(dataHexString)
  let dataSha2 = CryptoJS.SHA256(dataSha)
  let dataShaBuffer = hexstring2ab(dataSha2.toString())

  if (ab2hexstring(dataShaBuffer.slice(0, 4)) !== ab2hexstring(data.slice(data.length - 4, data.length))) {
    // wif verify failed.
    return -2
  }

  return data.slice(1, 33).toString('hex')
}

/**
 * Get public key from private key.
 * @param {string} privateKey - Private Key.
 * @param {boolean} encode - If the returned public key should be encrypted. Defaults to true
 * @return {ArrayBuffer} ArrayBuffer containing the public key.
 */
export const getPublicKey = (privateKey, encode) => {
  let ecparams = ecurve.getCurveByName('secp256r1')
  let curvePt = ecparams.G.multiply(BigInteger.fromBuffer(hexstring2ab(privateKey)))
  return curvePt.getEncoded(encode)
}

/**
 * Encodes an unencoded public key.
 * @param {string} publicKey - Unencoded public key.
 * @return {string} Encoded public key.
 */
export const getPublicKeyEncoded = (publicKey) => {
  let publicKeyArray = hexstring2ab(publicKey)
  if (publicKeyArray[64] % 2 === 1) {
    return '03' + ab2hexstring(publicKeyArray.slice(1, 33))
  } else {
    return '02' + ab2hexstring(publicKeyArray.slice(1, 33))
  }
}

/**
 * Constructs a valid address from a ProgramHash
 * @param {ArrayBuffer} ProgramHash - ProgramHash obtained from hashing the address
 * @returns {string} A valid NEO address
 */
export const toAddress = (ProgramHash) => {
  if (ProgramHash.length !== 20) throw new Error('Invalid ProgramHash length')
  let data = new Uint8Array(1 + ProgramHash.length)
  data.set([23]) // Wallet addressVersion
  data.set(ProgramHash, 1)
  // console.log(ab2hexstring(data))

  let scriptHashHex = CryptoJS.enc.Hex.parse(ab2hexstring(data))
  let scriptHashSha = CryptoJS.SHA256(scriptHashHex)
  let scriptHashSha2 = CryptoJS.SHA256(scriptHashSha)
  let scriptHashShaBuffer = hexstring2ab(scriptHashSha2.toString())
  // console.log(ab2hexstring(ProgramSha256Buffer))

  let datas = new Uint8Array(1 + ProgramHash.length + 4)
  datas.set(data)
  datas.set(scriptHashShaBuffer.slice(0, 4), 21)
  // console.log(ab2hexstring(datas))

  return base58.encode(datas)
}

/**
 * Gets the scriptHash of an address.
 * @param {string} address - The address
 * @return {string} scriptHash (BE)
 */
export const getScriptHashFromAddress = (address) => {
  let hash = ab2hexstring(base58.decode(address))
  return reverseHex(hash.substr(2, 40))
}

/**
 * Gets the scriptHash of a Public key.
 * @param {string} publicKey
 * @return {string} scriptHash (BE)
 */
export const getScriptHashFromPublicKey = (publicKey) => {
  return getScriptHashFromAddress(toAddress(hexstring2ab(getHash(createChainLineWalletScript(publicKey)))))
}
/**
 * Signs a transaction with a private key
 * @param {string} data - Serialised transaction data.
 * @param {string} privateKey - Private Key
 * @returns {string} Signature data.
 */
export const signatureData = (data, privateKey) => {
  let msg = CryptoJS.enc.Hex.parse(data)
  let msgHash = CryptoJS.SHA256(msg)
  const msgHashHex = Buffer.from(msgHash.toString(), 'hex')
  // const privateKeyHex = Buffer.from($privateKey, 'hex')
  // console.log( "msgHash:", msgHashHex.toString('hex'));
  // console.log('buffer', privateKeyHex.toString('hex'));

  let elliptic = new EC('p256')
  const sig = elliptic.sign(msgHashHex, privateKey, null)
  const signature = {
    signature: Buffer.concat([
      sig.r.toArrayLike(Buffer, 'be', 32),
      sig.s.toArrayLike(Buffer, 'be', 32)
    ])
  }
  return signature.signature.toString('hex')
}

/**
 * Verifies if the string is a valid NEO address.
 * @param {string} address - A string that can be a NEO address.
 * @returns {boolean} True if the string is a valid NEO address.
 */
export const verifyAddress = (address) => {
  let programHash = base58.decode(address)
  let programHexString = CryptoJS.enc.Hex.parse(ab2hexstring(programHash.slice(0, 21)))
  let programSha256 = CryptoJS.SHA256(programHexString)
  let programSha256Twice = CryptoJS.SHA256(programSha256)
  let programSha256Buffer = hexstring2ab(programSha256Twice.toString())

  // We use the checksum to verify the address
  if (ab2hexstring(programSha256Buffer.slice(0, 4)) !== ab2hexstring(programHash.slice(21, 25))) {
    return false
  }

  // As other chains use similar checksum methods, we need to attempt to transform the programHash back into the address
  if (toAddress(programHash.slice(1, 21)) !== address) {
    // address is not valid Neo address, could be btc, ltc etc.
    return false
  }

  return true
}

/**
 * Verifies if the string is a valid public key.
 * @param {string} publicKeyEncoded - A string that is a possible public key in encoded form.
 * @returns {boolean} True if the string is a valid encoded public key.
 */
export const verifyPublicKeyEncoded = (publicKeyEncoded) => {
  let publicKeyArray = hexstring2ab(publicKeyEncoded)
  if (publicKeyArray[0] !== 0x02 && publicKeyArray[0] !== 0x03) {
    return false
  }

  let ecparams = ecurve.getCurveByName('secp256r1')
  let curvePt = ecurve.Point.decodeFrom(ecparams, Buffer.from(publicKeyEncoded, 'hex'))
  // let curvePtX = curvePt.affineX.toBuffer(32)
  let curvePtY = curvePt.affineY.toBuffer(32)

  // console.log( "publicKeyArray", publicKeyArray )
  // console.log( "curvePtX", curvePtX )
  // console.log( "curvePtY", curvePtY )

  if (publicKeyArray[0] === 0x02 && curvePtY[31] % 2 === 0) {
    return true
  }

  if (publicKeyArray[0] === 0x03 && curvePtY[31] % 2 === 1) {
    return true
  }

  return false
}
