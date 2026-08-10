const { createCanvas } = require('canvas')
const fs = require('fs')

function generateIcon(size, filename) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  
  // 渐变背景
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, '#667eea')
  gradient.addColorStop(1, '#764ba2')
  
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2)
  ctx.fill()
  
  // 白色文字
  ctx.fillStyle = 'white'
  ctx.font = `bold ${size * 0.5}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🧠', size/2, size/2)
  
  const buffer = canvas.toBuffer('image/png')
  fs.writeFileSync(filename, buffer)
  console.log(`✅ Generated ${filename} (${size}x${size})`)
}

generateIcon(192, 'public/icon-192.png')
generateIcon(512, 'public/icon-512.png')
