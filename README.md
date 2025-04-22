## Run

```bash
# Install dependencies
yarn install

# Run Clickhouse
docker compose up -d ch 

# Run swaps indexing
yarn ts-node pipes/svm/swaps/cli.ts
```

TODO
---

- [ ] Clickhouse can get out of memory on cleanup.
    - Investigate deeply why they are duplicated. (EF)
    - Throw an error if too much data to clean up? (EF)


