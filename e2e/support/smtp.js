/**
 * A tiny SMTP server that keeps what Odoo sends, for scenarios that follow a link in an email.
 *
 * Odoo sends account emails (password reset, invitations) inside a savepoint it undoes afterwards, so the email is
 * never left in the database to read. The scenario points Odoo at this server for its duration instead
 * (`odoo.useMailServer`) and reads the message as it goes out.
 */
import net from 'node:net'

export function smtpCatcher(port = 2526) {
  const messages = []
  const server = net.createServer((socket) => {
    let buffer = ''
    let inData = false
    socket.write('220 loom-e2e ESMTP\r\n')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('binary')
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end === -1) return
          messages.push(decode(buffer.slice(0, end)))
          buffer = buffer.slice(end + 5)
          inData = false
          socket.write('250 OK\r\n')
          continue
        }
        const eol = buffer.indexOf('\r\n')
        if (eol === -1) return
        const line = buffer.slice(0, eol)
        buffer = buffer.slice(eol + 2)
        const command = line.slice(0, 4).toUpperCase()
        if (command === 'EHLO') socket.write('250-loom-e2e\r\n250 8BITMIME\r\n')
        else if (command === 'DATA') {
          inData = true
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        } else if (command === 'QUIT') {
          socket.end('221 Bye\r\n')
          return
        } else socket.write('250 OK\r\n')
      }
    })
    socket.on('error', () => {})
  })
  return {
    port,
    messages,
    listen: () => new Promise((resolve) => server.listen(port, '127.0.0.1', resolve)),
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/** The raw message with its base64 and quoted-printable parts decoded, to search for links. */
function decode(raw) {
  const parts = [raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))]
  for (const match of raw.matchAll(/Content-Transfer-Encoding: base64\r\n(?:[^\r\n]+\r\n)*\r\n([A-Za-z0-9+/=\r\n]+)/gi)) {
    parts.push(Buffer.from(match[1].replace(/\r\n/g, ''), 'base64').toString('utf8'))
  }
  return parts.join('\n')
}
