import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Palmtree } from 'lucide-react'
import sharp from 'sharp'

const icon = Buffer.from(renderToStaticMarkup(createElement(Palmtree, {
  size: 288, color: '#ffffff', strokeWidth: 1.6,
})))
const image = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#285648' } })
  .composite([{ input: icon, gravity: 'center' }]).png().toBuffer()

for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  await sharp(image).resize(size, size).png().toFile(new URL(`../public/${name}`, import.meta.url).pathname)
}
console.log('Generated 512px, 192px and Apple home-screen icons.')