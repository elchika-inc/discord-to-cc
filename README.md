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

### 2. Discord Application を作成する

1. [Discord Developer Portal](https://discord.com/developers/applications) を開く
2. 右上の **New Application** をクリック
3. Application 名を入力（例: `my-claude-bot`）して **Create**

### 3. Bot を追加して Token を取得する

1. 左メニュー **Bot** を選択
2. **Add Bot** → **Yes, do it!** で Bot を作成
3. **Token** セクションの **Reset Token** をクリック → 表示されたトークンをコピー

> [!IMPORTANT]
> **Token は一度しか表示されません。** 必ず安全な場所に保存してください。
> 漏洩した場合は同じ手順で Reset Token して古いトークンを無効化できます。

4. 同じページの **Privileged Gateway Intents** セクションで以下を **ON** にして **Save Changes**:

> [!IMPORTANT]
> **Message Content Intent を必ず ON にしてください。**
> OFF のままだとメッセージ本文が空文字になり、Claude Code に転送されません。

| Intent | 設定 |
|--------|------|
| Presence Intent | OFF でよい |
| Server Members Intent | OFF でよい |
| **Message Content Intent** | **ON（必須）** |

### 4. Bot をサーバーに招待する

1. 左メニュー **OAuth2** → **OAuth2 URL Generator** を選択
2. **Scopes** で `bot` にチェック
3. **Bot Permissions** で以下にチェック:
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
4. ページ下部の **Generated URL** をコピーしてブラウザで開く
5. 招待先のサーバーを選択 → **認証**

> [!TIP]
> Bot を起動した後に表示される `Invite URL` でも同じ操作ができます。

### 5. 各種 ID を取得する

ID を取得するには Discord の **開発者モード** が必要です。

**開発者モードを有効化:**
Discord クライアント → **設定（歯車アイコン）** → **詳細設定** → **開発者モード** を ON

---

#### Bot Token

上記の手順 3 で取得したトークンです。

```
DISCORD_BOT_TOKEN=your_bot_token_here
```

---

#### User ID（`DISCORD_ALLOWED_USER_IDS`）

自分のアカウントの ID を取得します。

1. 開発者モードが ON の状態で、**自分のアバター** を右クリック
2. **ユーザー ID をコピー** を選択

```
DISCORD_ALLOWED_USER_IDS=123456789012345678
```

複数ユーザーを許可する場合はカンマ区切り:

```
DISCORD_ALLOWED_USER_IDS=111111111111111111,222222222222222222
```

空にすると全ユーザーからのメッセージを受け付けます（非推奨）。

---

#### Channel ID（`DISCORD_ALLOWED_CHANNEL_IDS`）

特定チャンネルのメッセージだけを受信したい場合に設定します。

1. 開発者モードが ON の状態で、対象の **チャンネル名** を右クリック
2. **チャンネル ID をコピー** を選択

```
DISCORD_ALLOWED_CHANNEL_IDS=987654321098765432
```

複数チャンネルを許可する場合はカンマ区切り:

```
DISCORD_ALLOWED_CHANNEL_IDS=987654321098765432,111122223333444455
```

空にすると全チャンネルのメッセージを受け付けます。

> [!TIP]
> **複数プロジェクトで使い分ける場合の推奨構成:**
> Discord はBot Token ごとに WebSocket 接続が1本しか許可されません。
> プロジェクトごとに別の Bot（別の Token）を作成し、担当チャンネルを `DISCORD_ALLOWED_CHANNEL_IDS` で絞り込んでください。

---

### 6. Credentials を設定する

```bash
cp .env.example .env
```

`.env` を編集:

```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_ALLOWED_USER_IDS=your_user_id_here
DISCORD_ALLOWED_CHANNEL_IDS=your_channel_id_here
```

### 7. 起動確認

```bash
bun src/server.ts
```

以下のように表示されれば接続成功です:

```
[discord] Logged in as YourBot#1234
[discord] Invite URL: https://discord.com/oauth2/authorize?client_id=...&permissions=3072&scope=bot
```

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

> [!WARNING]
> `.mcp.json` に `DISCORD_BOT_TOKEN` を直書きした場合、`.gitignore` に追加してコミットしないよう注意してください。代わりに `.env` にトークンを設定し、`.mcp.json` の `env` フィールドを省略することを推奨します。

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
| `DISCORD_ALLOWED_CHANNEL_IDS` | No | カンマ区切りの許可チャンネル ID。空の場合は全チャンネル許可 |

## Limitations

- Claude Code Channels は Research Preview (要 `--dangerously-load-development-channels`)
- Discord のメッセージ上限は 2000 文字。超過時は自動分割送信
- テキストメッセージのみ対応（画像・ファイル非対応）
- Permission relay は常に自動許可（`allow` を即座に返す）

## Known Limitations

- 同時に複数ユーザーからメッセージが届いた場合、`discord_reply` の返信先が最後のメッセージに上書きされます。`DISCORD_ALLOWED_USER_IDS` で使用者を1名に限定することを推奨します。

## License

MIT
