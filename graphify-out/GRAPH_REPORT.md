# Graph Report - .  (2026-07-27)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 194 nodes · 378 edges · 22 communities (14 shown, 8 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b669c0fb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- app.js
- server.js
- dependencies
- apiUrl
- manifest.json
- syncUserProfile
- ExampleInstrumentedTest.java
- ExampleUnitTest.java
- gradlew
- MainActivity.java
- Deposit.js
- Setting.js
- Transaction.js
- User.js
- Voucher.js
- sw.js

## God Nodes (most connected - your core abstractions)
1. `apiUrl()` - 41 edges
2. `setupListeners()` - 33 edges
3. `getToken()` - 29 edges
4. `formatRupiah()` - 25 edges
5. `checkAuth()` - 13 edges
6. `renderProducts()` - 10 edges
7. `syncUserProfile()` - 9 edges
8. `executeDirectTransaction()` - 8 edges
9. `executeMidtransPaymentRequest()` - 8 edges
10. `initAdminListeners()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `setupListeners()` --indirect_call--> `handleSettingsChangePassword()`  [INFERRED]
  public/app.js → public/app.js  _Bridges community 0 → community 3_
- `executeDirectTransaction()` --calls--> `apiUrl()`  [EXTRACTED]
  public/app.js → public/app.js  _Bridges community 3 → community 5_
- `checkAuth()` --calls--> `renderTransactions()`  [EXTRACTED]
  public/app.js → public/app.js  _Bridges community 0 → community 5_

## Import Cycles
- None detected.

## Communities (22 total, 8 thin omitted)

### Community 0 - "app.js"
Cohesion: 0.12
Nodes (38): applyThemeAndAccent(), cancelDeposit(), checkAndShowActiveDepositModal(), checkAuth(), closeAllModals(), detectOperator(), DOM, exportToCSV() (+30 more)

### Community 1 - "server.js"
Cohesion: 0.06
Nodes (19): db, path, { Sequelize }, app, authenticateAdmin(), authenticateToken(), axios, cors (+11 more)

### Community 2 - "dependencies"
Cohesion: 0.06
Nodes (32): axios, @capacitor/android, cors, dotenv, express, jsonwebtoken, midtrans-client, nodemailer (+24 more)

### Community 3 - "apiUrl"
Cohesion: 0.20
Nodes (27): apiUrl(), fetchAnnouncement(), fetchBalance(), fetchDigiflazzDepositBalance(), formatRupiah(), getToken(), handleAdminAdjustBalance(), handleAdminApproveDeposit() (+19 more)

### Community 4 - "manifest.json"
Cohesion: 0.12
Nodes (15): background_color, categories, description, display, icons, id, name, orientation (+7 more)

### Community 5 - "syncUserProfile"
Cohesion: 0.31
Nodes (10): executeDirectTransaction(), executeMidtransPaymentRequest(), processPayment(), renderTransactions(), resetForm(), showReceipt(), simulateWebhookCallback(), syncPendingTransactions() (+2 more)

### Community 6 - "ExampleInstrumentedTest.java"
Cohesion: 0.60
Nodes (3): ExampleInstrumentedTest, Test, RunWith

### Community 8 - "gradlew"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

## Knowledge Gaps
- **58 isolated node(s):** `{ DataTypes }`, `{ DataTypes }`, `{ DataTypes }`, `{ DataTypes }`, `{ DataTypes }` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `apiUrl()` connect `apiUrl` to `app.js`, `syncUserProfile`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `setupListeners()` connect `app.js` to `apiUrl`, `syncUserProfile`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `setupListeners()` (e.g. with `exportToCSV()` and `handleApplyVoucher()`) actually correct?**
  _`setupListeners()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `{ DataTypes }`, `{ DataTypes }`, `{ DataTypes }` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12051282051282051 - nodes in this community are weakly interconnected._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._