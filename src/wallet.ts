import WebSocket from 'ws'
import fs from 'fs'
import elliptic from 'elliptic'
import { keyGen, getKeyPath, IClientNewKey, KeyData, ECCurveType } from './key'
import { KEYUTIL } from 'jsrsasign'
import {
  Logger,
  Checks,
  LogLevelDesc,
  LoggerProvider
} from '@hyperledger/cactus-common'

type IEcdsaCurves = {
  [key: string]: elliptic.ec;
};
const EC = elliptic.ec
const ecdsaCurves = {}
for (const value in ECCurveType) {
  ecdsaCurves[value] = new EC(value)
}

export interface WsWalletOpts {
  host: string;
  keyName?: string;
  curve?: ECCurveType;
  logLevel?: LogLevelDesc;
}

export interface WsWalletRes {
  signature: Buffer;
  index: number;
}
export interface WsWalletReq {
  digest: Buffer;
  index: number;
}

export class WsWallet {
  public readonly className = 'WsWallet';
  private readonly log: Logger;
  private readonly host: string;
  private ecdsaCurves: IEcdsaCurves;
  private keyName: string;
  private keyData: KeyData;
  private ws?: WebSocket;

  constructor (opts: WsWalletOpts) {
    const fnTag = `${this.className}#constructor()`
    Checks.truthy(opts, `${fnTag} arg options`)
    this.log = LoggerProvider.getOrCreate({
      label: 'WsWallet',
      level: opts.logLevel || 'INFO'
    })
    Checks.nonBlankString(opts.host, `${this.className}:opts.host`)
    this.host = opts.host
    opts.keyName = opts.keyName || 'default'
    this.keyData = this.initKey({ keyName: opts.keyName, curve: opts.curve })
  }

  /**
   * @description will generate a new EC private key, or get existing key it already exists
   * @param args;
   * @type IClientNewKey
   */
  private initKey (args: IClientNewKey): KeyData {
    const fnTag = `${this.className}#initKey`
    this.log.debug(
      `${fnTag} look for key with name '${args.keyName}' or generate new key`
    )
    const info = []
    const keyPath = getKeyPath(args.keyName)
    if (!fs.existsSync(keyPath)) {
      info.push(keyGen(args))
    }
    info.push(`extracting key '${args.keyName}' from key store`)
    this.keyName = args.keyName
    const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
    const curve = keyData.curve
    if (args.curve && curve !== args.curve) {
      info.push(
        `the requested curve type (${args.curve}) is different than the existing key: ${curve}`
      )
    }
    const result = info.join('\n')
    this.log.debug(`${fnTag} ${result}`)
    return keyData
  }

  /**
   * @description asynchronous request to get a new key and open new ws connection
   * @param args @type IClientNewKey
   */
  async getKey (args: IClientNewKey, sessionId: string): Promise<void> {
    try {
      this.keyData = this.initKey(args)
      await this.open(sessionId)
    } catch (error) {
      throw new Error(`Error setting client's key : ${error}`)
    }
  }

  /**
   * @description Closes existing and open new websocket connection for client
   */
  async open (sessionId: string): Promise<string> {
    const fnTag = `${this.className}#open`
    await this.close()
    try {
      // const { pubKeyHex } = KEYUTIL.getKey(this.keyData.pubKey);
      const sessionSignature = sign(
        Buffer.from(sessionId, 'hex'),
        this.keyData
      ).toString('hex')
      this.log.info(`${fnTag} open new web-socket to host ${this.host}`)
      this.log.info(`${fnTag} sessionId: ${sessionId}`)
      this.log.info(`${fnTag} signature: ${sessionSignature}`)
      const wsOpts = {
        headers: {
          'x-signature': sessionSignature,
          'x-session-id': sessionId,
          'x-pub-key-pem': JSON.stringify(this.keyData.pubKey)
        }
      }
      this.ws = new WebSocket(this.host, wsOpts)
      await waitForSocketState(this.ws, this.ws.OPEN)
      const { host, keyName, ws, log, keyData } = this
      this.ws.onerror = function (error) {
        log.error(`${fnTag} error in connection with host ${this.host}: ${error}`)
        ws.close()
      }
      this.ws.onopen = function () {
        log.info(`${fnTag} connection opened to ${host} for key ${keyName}`)
      }

      this.ws.onclose = function incoming () {
        log.info(`${fnTag} connection to ${host} closed for key ${keyName}`)
      }
      this.ws.on('message', function incoming (digest:Buffer) { // message: WsWalletReq
        const signature = sign(digest, keyData)
        // const resp:WsWalletRes = {signature,index: message.index}
        log.info(`send signature to web socket server ${ws.url}`)
        ws.send(signature)
      })
      return sessionSignature
    } catch (error) {
      throw new Error(
        `error creating web-socket connection to host ${this.host}: ${error}`
      )
    }
  }

  /**
   * @description : close the WebSocket
   */
  async close (): Promise<void> {
    if (this.ws) {
      this.ws.close()
      await waitForSocketState(this.ws, this.ws.CLOSED)
    }
  }

  /**
   * @description send out pubKey
   * @return pubKey pem file
   */
  getPubKeyHex () {
    const { pubKeyHex } = KEYUTIL.getKey(this.keyData.pubKey)
    return pubKeyHex
  }
}

/**
 * @description generate
 * @param prehashed digest as Buffer
 * @returns signature as string
 */
function sign (digest: Buffer, keyData: KeyData): Buffer {
  // const fnTag = `${this.className}#sign`;
  const { prvKeyHex } = KEYUTIL.getKey(keyData.key)
  const ecdsa = ecdsaCurves[keyData.curve]
  const signKey = ecdsa.keyFromPrivate(prvKeyHex, 'hex')
  const sig = ecdsa.sign(digest, signKey)
  const signature = Buffer.from(sig.toDER())
  return signature
}

/**
 * Forces a process to wait until the socket's `readyState` becomes the specified value.
 * @param socket The socket whose `readyState` is being watched
 * @param state The desired `readyState` for the socket
 */
function waitForSocketState (
  socket: WebSocket,
  state: number
): Promise<void> {
  return new Promise(function (resolve, reject) {
    try {
      setTimeout(function () {
        if (socket.readyState === state) {
          resolve()
        } else {
          waitForSocketState(socket, state).then(resolve)
        }
      })
    } catch (err) {
      reject(new Error(`Error waiting for socket state ${state}: ${err})`))
    }
  })
}
