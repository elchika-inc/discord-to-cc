#!/usr/bin/env bun
import { Client, Events, GatewayIntentBits, Message } from 'discord.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const ALLOWED_USER_IDS = (process.env.DISCORD_ALLOWED_USER_IDS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

if (!BOT_TOKEN) {
  console.error('[discord] Missing DISCORD_BOT_TOKEN')
  process.exit(1)
}

const MAX_TEXT_LENGTH = 2000

function splitText(text: string): string[] {
  if (text.length <= MAX_TEXT_LENGTH) return [text]
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += MAX_TEXT_LENGTH) {
    chunks.push(text.slice(i, i + MAX_TEXT_LENGTH))
  }
  return chunks
}

let lastReplyMessage: Message | null = null

const PermissionRequestSchema = z.object({
  method: z.literal('notifications/claude/channel/permission_request'),
  params: z.object({
    request_id: z.string(),
    tool_name: z.string(),
    description: z.string(),
    input_preview: z.string(),
  }),
})

// --- MCP Server ---
const mcp = new Server(
  { name: 'discord', version: '0.0.1' },
  {
    capabilities: {
      experimental: {
        'claude/channel': {},
        'claude/channel/permission': {},
      },
      tools: {},
    },
    instructions: [
      'Discord からのメッセージは <channel source="discord" user_id="..." channel_id="..." guild_id="..."> タグで届く。',
      'DM の場合は guild_id が含まれない。',
      'discord_reply tool は <channel source="discord"> タグ付きメッセージへの返信にのみ使用すること。',
      'テキストは Discord Markdown 形式 (**bold**, *italic*, `code`, ```block```) で記述できる。',
    ].join('\n'),
  },
)

// --- Tools ---
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'discord_reply',
      description: 'Send a reply to the Discord channel where the last message came from. Supports Discord Markdown.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          text: { type: 'string', description: 'Message text (Discord Markdown supported)' },
        },
        required: ['text'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'discord_reply') {
    const ArgsSchema = z.object({ text: z.string() })
    const parsed = ArgsSchema.safeParse(request.params.arguments)
    if (!parsed.success) {
      return { content: [{ type: 'text' as const, text: 'Invalid arguments.' }], isError: true }
    }
    const { text } = parsed.data
    if (!lastReplyMessage) {
      return { content: [{ type: 'text' as const, text: 'No active Discord conversation to reply to.' }], isError: true }
    }
    for (const chunk of splitText(text)) {
      await lastReplyMessage.channel.send(chunk)
    }
    return { content: [{ type: 'text' as const, text: `Message sent to channel ${lastReplyMessage.channelId}.` }] }
  }
  throw new Error(`Unknown tool: ${request.params.name}`)
})

// --- Permission Relay: 常に自動許可 ---
mcp.setNotificationHandler(PermissionRequestSchema, async ({ params }) => {
  console.error(`[discord] Auto-approving: ${params.tool_name} (${params.request_id})`)
  await mcp.notification({
    method: 'notifications/claude/channel/permission',
    params: { request_id: params.request_id, behavior: 'allow' },
  })
})

// --- Discord Client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
})

const seenMessageIds = new Set<string>()
const MAX_SEEN = 1000

function dedup(id: string): boolean {
  if (seenMessageIds.has(id)) return true
  seenMessageIds.add(id)
  if (seenMessageIds.size > MAX_SEEN) {
    const first = seenMessageIds.values().next().value
    if (first !== undefined) seenMessageIds.delete(first)
  }
  return false
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return
  if (dedup(message.id)) return

  const userId = message.author.id
  const isDm = !message.guildId
  const isMentioned = message.mentions.has(client.user!)

  if (!isDm && !isMentioned) return

  if (ALLOWED_USER_IDS.length > 0 && !ALLOWED_USER_IDS.includes(userId)) return

  const cleanText = message.cleanContent.trim()
  if (!cleanText) return

  lastReplyMessage = message

  const meta: Record<string, string> = {
    user_id: userId,
    channel_id: message.channelId,
  }
  if (message.guildId) meta.guild_id = message.guildId

  await mcp.notification({
    method: 'notifications/claude/channel',
    params: { content: cleanText, meta },
  })
})

client.once(Events.ClientReady, async (c) => {
  console.error(`[discord] Logged in as ${c.user.tag}`)
  console.error(`[discord] Invite URL: https://discord.com/oauth2/authorize?client_id=${c.user.id}&permissions=3072&scope=bot`)
  await mcp.notification({
    method: 'notifications/claude/channel',
    params: {
      content: `Discord channel ready. Logged in as ${c.user.tag}.`,
      meta: { status: 'ready' },
    },
  })
})

// --- Graceful Shutdown ---
process.stdin.on('end', () => {
  console.error('[discord] stdin closed, shutting down')
  client.destroy()
  process.exit(0)
})

// --- Connect MCP then login Discord ---
const transport = new StdioServerTransport()
await mcp.connect(transport)

await client.login(BOT_TOKEN)
