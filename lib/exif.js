const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

function imageToWebp(media) {
    return new Promise((resolve, reject) => {
        const tmpFileOut = path.join(
          require('os').tmpdir(), 
          `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
        );
        const tmpFileIn = path.join(
          require('os').tmpdir(), 
          `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.jpg`
        );
        fs.writeFileSync(tmpFileIn, media);
        
        spawn('ffmpeg', [
            '-i', tmpFileIn,
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1',
            tmpFileOut
        ])
        .on('error', reject)
        .on('close', () => {
            fs.unlinkSync(tmpFileIn);
            const buff = fs.readFileSync(tmpFileOut);
            fs.unlinkSync(tmpFileOut);
            resolve(buff);
        });
    });
}

function videoToWebp(media) {
    return new Promise((resolve, reject) => {
        const tmpFileOut = path.join(
          require('os').tmpdir(), 
          `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
        );
        const tmpFileIn = path.join(
          require('os').tmpdir(), 
          `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.mp4`
        );
        fs.writeFileSync(tmpFileIn, media);
        
        spawn('ffmpeg', [
            '-i', tmpFileIn,
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1',
            '-loop', '0',
            '-ss', '00:00:00.0',
            '-t', '00:00:10.0',
            '-preset', 'default',
            '-an',
            '-vsync', '0',
            tmpFileOut
        ])
        .on('error', reject)
        .on('close', () => {
            fs.unlinkSync(tmpFileIn);
            const buff = fs.readFileSync(tmpFileOut);
            fs.unlinkSync(tmpFileOut);
            resolve(buff);
        });
    });
}

async function writeExifImg(media, metadata) {
    let wMedia = await imageToWebp(media);
    const tmpFileOut = path.join(
      require('os').tmpdir(), 
      `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
    );
    const tmpFileIn = path.join(
      require('os').tmpdir(), 
      `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
    );
    fs.writeFileSync(tmpFileIn, wMedia);
    
    if (metadata.packname || metadata.author) {
        const img = new webp.Image();
        const json = { "sticker-pack-id": `https://github.com/kiuur`, "sticker-pack-name": metadata.packname, "sticker-pack-publisher": metadata.author, "emojis": metadata.categories ? metadata.categories : [""] };
        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
        const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
        const exif = Buffer.concat([exifAttr, jsonBuff]);
        exif.writeUIntLE(jsonBuff.length, 14, 4);
        await img.load(tmpFileIn);
        fs.unlinkSync(tmpFileIn);
        img.exif = exif;
        await img.save(tmpFileOut);
        return tmpFileOut;
    }
}

async function writeExifVid(media, metadata) {
    let wMedia = await videoToWebp(media);
    const tmpFileOut = path.join(
      require('os').tmpdir(), 
      `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
    );
    const tmpFileIn = path.join(
      require('os').tmpdir(), 
      `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
    );
    fs.writeFileSync(tmpFileIn, wMedia);
    
    if (metadata.packname || metadata.author) {
        const img = new webp.Image();
        const json = { "sticker-pack-id": `https://github.com/DikaArdnt/Hisoka-Morou`, "sticker-pack-name": metadata.packname, "sticker-pack-publisher": metadata.author, "emojis": metadata.categories ? metadata.categories : [""] };
        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
        const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
        const exif = Buffer.concat([exifAttr, jsonBuff]);
        exif.writeUIntLE(jsonBuff.length, 14, 4);
        await img.load(tmpFileIn);
        fs.unlinkSync(tmpFileIn);
        img.exif = exif;
        await img.save(tmpFileOut);
        return tmpFileOut;
    }
}

async function addExif(media) {
    const { Image } = require('node-webpmux');
    const img = new Image();
    await img.load(media);
    img.exif = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    return img.save(null);
}

module.exports = { imageToWebp, videoToWebp, writeExifImg, writeExifVid, addExif };