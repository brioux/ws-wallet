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
