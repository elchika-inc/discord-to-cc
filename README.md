# discord-to-cc

Discord を Claude Code Channels のカスタムチャネルプラグインとして実装。Discord からローカルの Claude Code セッションを操作できる。

## Features

- Discord DM または Bot メンション経由の双方向テキストチャット
- `DISCORD_ALLOWED_USER_IDS` で特定ユーザーのみ許可するフィルタリング
- ツール実行の Permission relay は自動許可（`allow` を即座に返す）
- メッセージ重複排除（`seenMessageIds` による dedup）

## Prerequisites

- [Claude Code](https://claude.ai/claude-code) v2.1.80+
- [Bun](https://bun.sh/) latest

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/naoto24kawa/discord-to-cc.git
cd discord-to-cc
bun install
```

### 2. Discord Developer Portal

1. [Discord Developer Portal](https://discord.com/developers/applications) にログイン
2. **New Application** で Application を作成
3. 左メニュー「**Bot**」→「**Add Bot**」でボットを追加
4. 「**Token**」セクションの「**Reset Token**」でトークンを取得してコピー

> [!IMPORTANT]
> 同じ「Bot」ページの「**Privileged Gateway Intents**」セクションで **Message Content Intent** を **ON** にしてください。
> これを有効にしないと、Bot はメッセージ本文を受信できず、Claude Code に転送されません。

### 3. Credentials

```bash
cp .env.example .env
```

`.env` を編集して Bot Token と許可ユーザー ID を設定:

```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_ALLOWED_USER_IDS=123456789012345678
```

**User ID の確認方法:**

1. Discord クライアントの「**設定**」→「**詳細設定**」→「**開発者モード**」を ON
2. 許可したいユーザーのアバターを右クリック →「**ユーザーIDをコピー**」

複数ユーザーを許可する場合はカンマ区切りで指定:

```env
DISCORD_ALLOWED_USER_IDS=111111111111111111,222222222222222222
```

`DISCORD_ALLOWED_USER_IDS` を空にすると全ユーザーからのメッセージを受け付けます。

### 4. Start

```bash
bun src/server.ts
```

起動すると以下のように表示されます:

```
[discord] Logged in as YourBot#1234
[discord] Invite URL: https://discord.com/oauth2/authorize?client_id=...&permissions=3072&scope=bot
```

### 5. Invite Bot to Server

上記の起動ログに表示される **Invite URL** をブラウザで開き、Bot を招待したいサーバーを選択して追加します。

## Claude Code への組み込み

### `.mcp.json` で設定する方法

プロジェクトルートに `.mcp.json` を作成:

```json
{
  "mcpServers": {
    "discord": {
      "type": "stdio",
      "command": "bun",
      "args": ["/path/to/discord-to-cc/src/server.ts"],
      "env": {
        "DISCORD_BOT_TOKEN": "your_bot_token_here",
        "DISCORD_ALLOWED_USER_IDS": "123456789012345678"
      }
    }
  }
}
```

> [!TIP]
> `env` フィールドに直接トークンを書く代わりに、`.env` ファイルに記述して `bun --env-file .env src/server.ts` のように起動することも可能です。

### 起動コマンド

```bash
claude --dangerously-load-development-channels server:discord
```

Claude Code セッションが起動すると Discord channel が自動的に接続され、`Discord channel ready` 通知が届きます。

## Usage

| 方法 | 説明 |
|------|------|
| **DM** | Bot に直接 DM を送信する。サーバーへの招待不要で手軽 |
| **メンション** | サーバーのチャンネルで `@BotName メッセージ` のように Bot をメンション |

DM・メンションどちらの場合も、Claude Code セッションには以下の形式で転送されます:

```xml
<channel source="discord" user_id="..." channel_id="..." guild_id="...">
メッセージ本文
</channel>
```

DM の場合は `guild_id` は含まれません。

## MCP Tools

| Tool | Description |
|------|-------------|
| `discord_reply` | 直近のメッセージが届いたチャンネルに返信を送信。Discord Markdown 対応 |

## Environment Variables

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `DISCORD_BOT_TOKEN` | Yes | Discord Bot のトークン |
| `DISCORD_ALLOWED_USER_IDS` | No | 許可するユーザー ID のカンマ区切りリスト。空の場合は全員許可 |

## Limitations

- Claude Code Channels は Research Preview (要 `--dangerously-load-development-channels`)
- Discord のメッセージ上限は 2000 文字。超過時は自動分割送信
- テキストメッセージのみ対応（画像・ファイル非対応）
- Permission relay は常に自動許可（`allow` を即座に返す）

## License

MIT
