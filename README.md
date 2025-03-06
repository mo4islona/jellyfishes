## Run

```bash
# Install dependencies
yarn install

# Run Clickhouse
docker compose up -d ch 

# Run swaps indexing
yarn ts-node solana_dexes/swaps/cli.ts
```

TODO
---

- [x] ~~Writing two pipelines into one table.~~ Implemented `filter` option for `ClickhouseState`.
- [ ] Add a block timestamp to offset. It is important if you want to change the order of clickhouse raw data, because
  the user wants to query data by timestamp not blocks.
- [ ] Move range blocks to the general abstract stream options, because this logic can be reused (`range`,
  `blockRange` ?)
- [ ] Rename too generic `AbstractStream` to `AbstractPortalStream` — AbstractHttpStream (pyth?),
  AbstractS3Stream and so on. Out of scope for now, but let's leave some room for further types of streams if possible
- [ ] Clickhouse can get out of memory on cleanup.
    - Investigate deeply why they are duplicated. (EF)
    - Throw an error if too much data to clean up? (EF)


