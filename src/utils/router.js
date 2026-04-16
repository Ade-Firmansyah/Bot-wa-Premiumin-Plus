function parseCommand(rawText) {
  const normalized = rawText.toString().trim().toLowerCase()
  const match = normalized.match(/^([a-z]+)(\d*)\s*(.*)$/)
  if (!match) {
    return { command: normalized, args: [] }
  }

  const [, command, digits, rest] = match
  const args = []

  if (digits) {
    args.push(digits)
  }

  if (rest) {
    args.push(...rest.split(/\s+/).filter(Boolean))
  }

  return { command, args }
}

function createRouter(routeMap) {
  return async function route(rawText, context) {
    const { command, args } = parseCommand(rawText)
    const handler = routeMap[command] || routeMap.default
    return handler(context, args)
  }
}

module.exports = {
  parseCommand,
  createRouter
}
