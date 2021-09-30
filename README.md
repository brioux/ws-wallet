# web-socket wallet

This project provides a simple CLI to establish web-socket connection used by a a crypto wallet to receive, sign and return digests. 

## Key-types

The wallet issues ECDSA keypairs of type p256 and p384 (secp256r1/secp384r1)

## Development setup
* Download dependencies
```
npm install
```

* Run in dev mode
```
npm run build
```

* Expose CLI command (see ws-wallet --help)
```
npm run local
```
```
Usage: ws-wallet
new-key <keyname> [<curve>]	            Generate a new key with optional curve: 'p256' | 'p384'
get-pkh <keyname>          	            Get publick key hex of keyname
connect <host> <sessionId> [<keyname>] 	connect sessionId with host of web socket server. 
                                         keyname optional (use default)


Options:
      --version  Show version number                              
  -k, --keys     List all key names                               
      --help     Show help                                        
