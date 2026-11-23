import { useState } from 'react'
import { Check, Copy, Plug, Trash2 } from 'lucide-react'
import { api } from '@/api'
import { clearPrivateHome, getPrivateHome } from '@/privateHome'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="house-copy">
      <span>{label}</span>
      <div>
        <code>{value}</code>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            }, () => setCopied(false))
          }}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

/** How to point an AI agent at this home. No sign-in or API key is involved. */
export function ConnectAgent({ homeId }: { homeId: string }) {
  const mcpUrl = `${location.origin}/mcp/${homeId}`
  return (
    <details className="house-connect">
      <summary><Plug size={15} aria-hidden="true" />Connect an AI agent</summary>
      <div className="house-connect-panel">
        <p>Add this home as a remote MCP server. No sign-in or API key. Everything the agent changes appears here live, and only in this home.</p>
        <CopyField label="MCP server URL" value={mcpUrl} />
        <CopyField label="Claude Code" value={`claude mcp add --transport http virtual-home ${mcpUrl}`} />
        <p>Other agents: add a remote (Streamable HTTP) MCP server with the URL above. Tools: <code>get_house</code>, <code>set_lights</code>, <code>set_door</code>, <code>set_tv</code>.</p>
        <CopyField label="Link to watch this home" value={location.href} />
        {getPrivateHome() === homeId && (
          <button
            type="button"
            className="house-delete"
            onClick={() => {
              if (!window.confirm('Delete this home and everything in it? An agent connected to it will start from a fresh empty home.')) return
              void api.house.remove(homeId).then(() => {
                clearPrivateHome()
                location.assign('/')
              })
            }}
          >
            <Trash2 size={14} aria-hidden="true" />Delete this home
          </button>
        )}
      </div>
    </details>
  )
}
