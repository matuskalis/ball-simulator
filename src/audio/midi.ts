/** Minimal .mid reader: returns note-on pitches in playback order. */
export function readMidiNotes(data: Uint8Array): number[] {
  if (String.fromCharCode(...data.subarray(0, 4)) !== "MThd") {
    throw new Error("Not a MIDI file (missing MThd header)");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const trackCount = view.getUint16(10);
  const notes: { tick: number; pitch: number }[] = [];

  let offset = 8 + view.getUint32(4);
  for (let track = 0; track < trackCount && offset < data.length; track += 1) {
    if (String.fromCharCode(...data.subarray(offset, offset + 4)) !== "MTrk") break;
    const length = view.getUint32(offset + 4);
    let cursor = offset + 8;
    const end = cursor + length;
    let tick = 0;
    let runningStatus = 0;

    while (cursor < end) {
      let delta = 0;
      for (;;) {
        const byte = data[cursor];
        cursor += 1;
        delta = (delta << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) break;
      }
      tick += delta;

      let status = data[cursor];
      if (status & 0x80) {
        cursor += 1;
        runningStatus = status;
      } else {
        status = runningStatus;
      }

      if (status === 0xff) {
        cursor += 1;
        let metaLength = 0;
        for (;;) {
          const byte = data[cursor];
          cursor += 1;
          metaLength = (metaLength << 7) | (byte & 0x7f);
          if ((byte & 0x80) === 0) break;
        }
        cursor += metaLength;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        let sysexLength = 0;
        for (;;) {
          const byte = data[cursor];
          cursor += 1;
          sysexLength = (sysexLength << 7) | (byte & 0x7f);
          if ((byte & 0x80) === 0) break;
        }
        cursor += sysexLength;
        continue;
      }

      const type = status & 0xf0;
      if (type === 0x90) {
        const pitch = data[cursor];
        const velocity = data[cursor + 1];
        cursor += 2;
        if (velocity > 0) notes.push({ tick, pitch });
      } else if (type === 0x80 || type === 0xa0 || type === 0xb0 || type === 0xe0) {
        cursor += 2;
      } else {
        cursor += 1;
      }
    }
    offset = end;
  }

  if (notes.length === 0) throw new Error("MIDI file contains no note-on events");
  notes.sort((a, b) => a.tick - b.tick);
  return notes.map((n) => n.pitch);
}
