# 🎬 สุ่มเสียง VIDEOCUT

โปรแกรมตัดต่อวิดีโอ — รวมคลิป ใส่เสียง เส้นเสียงเต้นตามจังหวะ ส่งออก MP4

## ดาวน์โหลด

ไปที่ **[Releases](../../releases/latest)** แล้วเลือกตาม OS

| ระบบ | ไฟล์ |
|---|---|
| 🪟 Windows | `SUOMSIANG-VIDEOCUT-Setup-x.x.x.exe` |
| 🍎 macOS | `SUOMSIANG-VIDEOCUT-x.x.x.dmg` |
| 🐧 Linux | `SUOMSIANG-VIDEOCUT-x.x.x.AppImage` |

## ฟีเจอร์
- 🎬 ตัดต่อวิดีโอ MP4/MOV/AVI ด้วย timeline
- 🖼 ใส่ภาพนิ่ง PNG/JPG ใน timeline ได้
- 🎵 ใส่เสียง MP3/WAV เป็น background audio
- 〰️ เส้นเสียง waveform เต้นตามจังหวะเพลง 9 แบบ
- ✂️ ตัด/แบ่งคลิปที่ตำแหน่ง playhead
- 🖼 โลโก้ / สติกเกอร์ซ้อนบนวิดีโอ
- ✨ กรอบข้อความกระพริบ (Badge) 9 สไตล์
- 🎞 Transitions ระหว่างคลิป (Fade, Dissolve, Zoom ฯลฯ)
- 📤 ส่งออก MP4 720p/1080p พร้อม waveform animated
- 🔲 รองรับ AR: 16:9, 9:16, 1:1, 4:3, 4:5, 21:9

## Build เอง

```bash
git clone https://github.com/YOUR_USERNAME/suomsiang-videocut.git
cd suomsiang-videocut
npm install
npm start          # รันแบบ dev
npm run build:win  # build Windows
npm run build:mac  # build macOS
npm run build:linux # build Linux
```

## Release ใหม่

```bash
git tag v4.0.1
git push origin v4.0.1
```
GitHub Actions จะ build และสร้าง Release อัตโนมัติ

## License
MIT
