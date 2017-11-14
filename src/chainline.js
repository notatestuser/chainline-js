import CryptoJS from 'crypto-js'
import ScriptBuilder, { buildScript } from './sc/scriptBuilder.js'
import { getAccountFromWIFKey } from './wallet'
import { getBalance, queryRPC, doInvokeScript, parseVMStack } from './api'
import { fixed82num, int2hex, reverseHex } from './utils'
import * as tx from './transactions/index.js'

export const Constants = {
  // Nets
  MAIN_NET: 'MainNet',
  TEST_NET: 'TestNet',
  // Fees
  FEE_DEMAND_REWARD_GAS: 4,
  FEE_TRAVEL_DEPOSIT_GAS: 2,
  // commit cefaf880c96dd5f0657ea5da55aa0d9396bd86a8 (hub-1.0)
  HUB_SCRIPT_HASH: '0b51b02450011dd31fa2bd3d1c5c6c16533dda4e'
}

/**
 * Generates the wallet script given a user's public key.
 * @param {string} publicKeyHex - The public key, hex encoded
 * @return {string} The wallet script, hex encoded
 */
export const generateWalletScript = (publicKeyHex) => (
  // commit 70b3156bbfdc863492d18c99bc3102cdd8e5c16e (wallet-1.0)
 `60c56b6a51527ac46a51c34c097369676e61747572656175754c
  ${int2hex(publicKeyHex.length / 2)}
  ${publicKeyHex}
  6a52527ac44c20e72d286979ee6cb1b7e65dfddfb2e384100b8d148e7758de42e4168b71792c606a53
  527ac46a51c36a52c361617c6569026161f16161682953797374656d2e457865637574696f6e456e67
  696e652e476574536372697074436f6e7461696e65726a54527ac46161682d53797374656d2e457865
  637574696f6e456e67696e652e476574457865637574696e67536372697074486173686a55527ac46a
  54c36161681d4e656f2e5472616e73616374696f6e2e4765745265666572656e6365736a56527ac400
  6a5e527ac46a56c36a57527ac4006a58527ac46a58c36a57c3c0a2636c006a57c36a58c3c36a59527a
  c46a59c36a5a527ac46a5ac3616168154e656f2e4f75747075742e476574417373657449646a53c387
  916326006a5ec36a5ac3616168134e656f2e4f75747075742e47657456616c7565936a5e527ac4616a
  58c351936a58527ac4628fff616a5ec300948d00a1633c016a54c36161681a4e656f2e5472616e7361
  6374696f6e2e4765744f7574707574736a57527ac46a57c36a58527ac4006a59527ac46a59c36a58c3
  c0a26393006a58c36a59c3c36a5a527ac46a5ac36a5b527ac46a5bc3616168184e656f2e4f75747075
  742e476574536372697074486173686a55c38791634a006a5bc3616168154e656f2e4f75747075742e
  476574417373657449646a53c387916326006a5ec36a5bc3616168134e656f2e4f75747075742e4765
  7456616c7565946a5e527ac4616a59c351936a59527ac46268ff616a5ec300948d00a16361004c1377
  616c6c65745f7265717565737454784f757453c576006a55c3764c13657865637574696e6753637269
  707448617368617575c476516a52c3c476526a5ec361c461617c67
  ${reverseHex(Constants.HUB_SCRIPT_HASH)}
  6c7566516c75666153c56b6a00527ac46a51527ac46a00c36a51c361ac6c756661
 `.replace(/[\r\n\s]/g, ''))

// UTILS

/**
 * Makes a city pair hash, used by the contract for matching demands with other users.
 * @param {string} pickUpCity - The pick up city
 * @param {string} dropOffCity - The destination city
 * @return {string} The city pair hash
 */
const makeCityPairHash = (pickUpCity, dropOffCity) =>
  CryptoJS.RIPEMD160(Constants.HUB_SCRIPT_HASH + pickUpCity + dropOffCity).toString()

/**
 * Parses a fixed8 VM return value into a floating point.
 * @param {number} The parsed floating point value.
 */
const parseReservedBalance = (stackItem) => {
  const val = stackItem.value
  let reservedBalance = 0
  if (typeof val === 'string' && val.length) {
    reservedBalance = Number.parseInt(val, 10)
  }
  return reservedBalance
}

/**
 * Parses an integer VM return value into a JS integer.
 * @param {number} The parsed integer value.
 */
const parseReputationScore = (stackItem) => {
  let reputation = Number.parseInt(stackItem.value, 10)
  if (Number.isNaN(reputation)) reputation = 0
  return reputation
}

// LOCAL INVOKES

/**
 * Gets the unix epoch timestamp of the last synced block.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @return {number} The timestamp
 */
export const getTimestamp = async (net) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'timestamp')
  const res = await doInvokeScript(net, sb.str, false)
  const [timestamp] = parseVMStack(res.stack)
  return timestamp
}

/**
 * Gets all the global stats recorded by the contract in one object.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @return {{demands: number, cities: number, funds: number}} Stats
 */
export const getStats = async (net) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'stats_getDemandsCount')
    .emitAppCall(scriptHash, 'stats_getRouteUsageCount')
    .emitAppCall(scriptHash, 'stats_getReservedFundsCount')
  const res = await doInvokeScript(net, sb.str, false)
  const [demandsStack, routesItemStack, fundsStack] = res.stack.slice(0, 3)
  return {
    demands: Number.parseInt(reverseHex(demandsStack.value), 16) || 0,
    routes: Number.parseInt(reverseHex(routesItemStack.value), 16) || 0,
    funds: fixed82num(fundsStack.value) || 0
  }
}

/**
 * Retrieves a wallet's state attributes (reserved balance and reputation score) in one invoke run.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} wif - The wallet's wif key
 * @param {{reservedBalance: number, reputation: number}} The wallet's reserved balance (floating point) and reputation score (int)
 */
export const getWalletState = async (net, wif, userScriptHash) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'wallet_getReservedGasBalance', [userScriptHash])
    .emitAppCall(scriptHash, 'stats_getUserReputationScore', [userScriptHash])
  const res = await doInvokeScript(net, sb.str, true)
  const [reservedBalance, reputation] = res.stack
  return {
    reservedBalance: reservedBalance ? reservedBalance / 100000000 : 0,
    reputation: reputation || 0
  }
}

/**
 * Gets a wallet's reserved GAS balance.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} wif - The wallet's WIF key
 * @return {number} Reserved GAS as a floating point
 */
export const getReservedGasBalance = async (net, wif) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const account = getAccountFromWIFKey(wif)
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'wallet_getReservedGasBalance', [account.programHash])
  const res = await doInvokeScript(net, sb.str, false)
  return { reservedBalance: parseReservedBalance(res.stack[0]) }
}

/**
 * Gets a wallet's user reputation score.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} userScriptHash - The user's script hash to look up
 * @return {number} The user's reputation score as a zero-based positive integer
 */
export const getUserReputationScore = async (net, userScriptHash) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'stats_getUserReputationScore', [userScriptHash])
  const res = await doInvokeScript(net, sb.str, false)
  return { score: parseReputationScore(res.stack[0]) }
}

/**
 * Retrieves an object from the contract by ID (essentially a Storage.get)
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} id - The ID of the object, provided by either openDemand or openTravel
 * @return {string|boolean} The retrieved object, hex encoded, or false on failure
 */
export const getObjectById = async (net, id) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'storage_get', [id])
  const res = await doInvokeScript(net, sb.str, false)
  const [retrieved] = parseVMStack(res.stack)
  return retrieved || false
}

/**
 * Retrieves the Travel object matched with a Demand and the time they were matched at.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} demand - The entire Demand object, hex encoded
 * @return {{travel: string, matchTime: number}|boolean} The matched Travel object, hex encoded, and match time (epoch secs) or false if unmatched
 */
export const getDemandTravelMatch = async (net, demand) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'demand_getTravelMatch', [demand])
    .emitAppCall(scriptHash, 'demand_getTravelMatchedAtTime', [demand])
  const res = await doInvokeScript(net, sb.str, false)
  const [travel, matchTime] = parseVMStack(res.stack)
  return travel ? { travel, matchTime } : false
}

/**
 * Retrieves the Demand object matched with a Travel and the time they were matched at.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} travel - The entire Travel object, hex encoded
 * @return {{demand: string, matchTime: number}|boolean} The matched Demand object, hex encoded, and match time (epoch secs) or false if unmatched
 */
export const getTravelDemandMatch = async (net, travel) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'travel_getDemandMatch', [travel])
    .emitAppCall(scriptHash, 'travel_getDemandMatchedAtTime', [travel])
  const res = await doInvokeScript(net, sb.str, false)
  const [demand, matchTime] = parseVMStack(res.stack)
  return demand ? { demand, matchTime } : false
}

// BLOCKCHAIN INVOKES

/**
 * Opens a Demand via a blockchain or local invocation.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} wif - The wallet's WIF key
 * @param {{expiry: number, repRequired: number, itemSize: number, itemValue: number, infoBlob: string, pickUpCity: string, dropOffCity: string}}
 * @param {boolean} sendTx - Set to true to perform a blockchain invoke (invocation transaction), otherwise it will execute locally
 * @param {number} gas - The amount of GAS to send in the transaction's inputs (if applicable)
 * @return {{result: boolean, gasConsumed?: number, success?: boolean}} The result, amount of GAS consumed (if local invoke) and return value
 */
export const openDemand = async (net, wif, {
  expiry,      // expiry: BigInteger
  repRequired, // repRequired: BigInteger
  itemSize,    // itemSize: BigInteger
  itemValue,   // itemValue: BigInteger
  infoBlob,    // infoBlob: ByteArray
  pickUpCity,  // pickUpCity: Hash160, these are converted to a hashed "pair"
  dropOffCity  // dropOffCity: Hash160
}, sendTx = false, gas = 0) => {
  const account = getAccountFromWIFKey(wif)
  const itemValueFixed8 = Math.ceil(itemValue * 100000000)  // satoshi ceil
  const cityPairHash = makeCityPairHash(pickUpCity, dropOffCity)
  const invoke = {
    scriptHash: Constants.HUB_SCRIPT_HASH,
    operation: 'demand_open',
    args: [
      // owner: ScriptHash
      // already little endian
      account.programHash,
      // publicKey
      account.publicKeyEncoded,
      // all the rest
      expiry, repRequired, itemSize, itemValueFixed8, infoBlob, cityPairHash
    ]
  }
  const script = buildScript(invoke)
  if (sendTx) {
    const balances = await getBalance(net, account.address)
    const intents = [
      // a non-zero value in outputs makes tx validation go through
      { assetId: tx.ASSETS['GAS'], value: 0.001, scriptHash: account.programHash }
    ]
    const unsignedTx = tx.create.invocation(account.publicKeyEncoded, balances, intents, script, gas, { version: 1 })
    const signedTx = tx.signTransaction(unsignedTx, account.privateKey)
    const hexTx = tx.serializeTransaction(signedTx)
    return queryRPC(net, 'sendrawtransaction', [hexTx], 4)
  }
  const res = await doInvokeScript(net, script, false)
  if (res.state && res.state.startsWith('HALT')) {
    const success = res.stack && res.stack.length && res.stack[0].value !== ''
    return { result: true, gasConsumed: res.gas_consumed, success }
  }
  return { result: false }
}

/**
 * Opens a Travel via a blockchain or local invocation.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} wif - The wallet's WIF key
 * @param {{expiry: number, repRequired: number, carrySpace: number, pickUpCity: string, dropOffCity: string}}
 * @param {boolean} sendTx - Set to true to perform a blockchain invoke (invocation transaction), otherwise it will execute locally
 * @param {number} gas - The amount of GAS to send in the transaction's inputs (if applicable)
 * @return {{result: boolean, gasConsumed?: number, success?: boolean}} The result, amount of GAS consumed (if local invoke) and return value
 */
export const openTravel = async (net, wif, {
  expiry,      // expiry: BigInteger
  repRequired, // repRequired: BigInteger
  carrySpace,  // carrySpace: BigInteger
  pickUpCity,  // pickUpCity: Hash160
  dropOffCity  // dropOffCity: Hash160
}, sendTx = false, gas = 0) => {
  const account = getAccountFromWIFKey(wif)
  const cityPairHash = makeCityPairHash(pickUpCity, dropOffCity)
  const invoke = {
    scriptHash: Constants.HUB_SCRIPT_HASH,
    operation: 'travel_open',
    args: [
      // owner: ScriptHash
      // already little endian
      account.programHash,
      // publicKey
      account.publicKeyEncoded,
      // all the rest
      expiry, repRequired, carrySpace, cityPairHash
    ]
  }
  const script = buildScript(invoke)
  if (sendTx) {
    const balances = await getBalance(net, account.address)
    const intents = [
      // a non-zero value in outputs makes tx validation go through
      { assetId: tx.ASSETS['GAS'], value: 0.001, scriptHash: account.programHash }
    ]
    const unsignedTx = tx.create.invocation(account.publicKeyEncoded, balances, intents, script, gas, { version: 1 })
    const signedTx = tx.signTransaction(unsignedTx, account.privateKey)
    const hexTx = tx.serializeTransaction(signedTx)
    return queryRPC(net, 'sendrawtransaction', [hexTx], 4)
  }
  const res = await doInvokeScript(net, script, false)
  if (res.state && res.state.startsWith('HALT')) {
    const success = res.stack && res.stack.length && res.stack[0].value !== ''
    return { result: true, gasConsumed: res.gas_consumed, success }
  }
  return { result: false }
}
