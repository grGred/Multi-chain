**Install executor there by:**

 ```
 # Linux
curl -L https://github.com/celer-network/sgn-v2-networks/raw/main/binaries/executor-v1.6.0-dev.1-linux-amd64.tar.gz -o executor.tar.gz
# MacOS Intel chip
curl -L https://github.com/celer-network/sgn-v2-networks/raw/main/binaries/executor-v1.6.0-dev.1-darwin-amd64.tar.gz -o executor.tar.gz
# MacOS Apple chip
curl -L https://github.com/celer-network/sgn-v2-networks/raw/main/binaries/executor-v1.6.0-dev.1-darwin-arm64.tar.gz -o executor.tar.gz
```
**Configurations:**

```
.executor/
  - config/
      - executor.toml
      - cbridge.toml
  - eth-ks/
      - signer.json
 ```
