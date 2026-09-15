
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GROUND_TRUTH_DATA = [
  {
    artist: 'Bengo',
    tracks: [
      { title: 'Galdu Gattezen', externalId: 'ghNA8wTrSmI', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/18/cd/25/18cd25a7-eaa8-3282-a17d-28bb24a4c831/mzaf_15492999691862970648.plus.aac.p.m4a' },
      { title: 'Beldurrik Gabe', externalId: 'x1ECsx6lbwE', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/02/a5/22/02a5228a-a312-bfec-8014-257acd0e5f28/mzaf_8749929553842873852.plus.aac.p.m4a' }
    ]
  },
  {
    artist: 'ZETAK',
    tracks: [
      { title: 'Zeinen Ederra Izango Den', externalId: '4phtwVJqSuw', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview114/v4/ba/ef/1d/baef1dc9-cbeb-5935-ac83-2f7e77666b47/mzaf_2043386368707079735.plus.aac.p.m4a' },
      { title: 'Itzulera', externalId: 'ZErUMnB7aMk', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/a0/5e/23/a05e2353-43ac-f0ef-3d3c-774df9af14f1/mzaf_9891321263478634825.plus.aac.p.m4a' }
    ]
  },
  {
    artist: 'La Txama',
    tracks: [
      { title: 'Musa 13', externalId: 'KdkZM4rzRSA', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview122/v4/97/49/63/974963c6-dc15-a699-519f-23f06c5f3433/mzaf_13987627347685713636.plus.aac.p.m4a' },
      { title: 'Fusilaren Hotsa', externalId: '9gBPu-BU0jQ', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/cf/a6/8d/cfa68dba-e006-110f-bbee-533332ca9363/mzaf_3275564627724789443.plus.aac.p.m4a' }
    ]
  },
  {
    artist: 'Izaro',
    tracks: [
      { title: 'Aske Maitte', externalId: 'hnwYJzZyqzk', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/ae/77/97/ae77977e-212a-0889-8136-426dc00585e9/mzaf_13385617291043792300.plus.aac.p.m4a' },
      { title: 'Oso Blanco', externalId: 'Ir6LtvAKBqY', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/af/83/69/af83699a-dbcc-d8f9-dd6f-79f5be8e0356/mzaf_13491605586197966985.plus.aac.p.m4a' }
    ]
  },
  {
    artist: 'Anari',
    tracks: [
      { title: 'Efemerideak', externalId: 'fao20vtn8cA', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/2c/39/44/2c3944b3-ee65-36ce-590e-0ac02257d2ed/mzaf_14942995138019367593.plus.aac.p.m4a' },
      { title: 'Orfidentalak', externalId: '6XiiX5aFTFM', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/3f/22/08/3f220857-55e4-323c-740b-037e1007371a/mzaf_5868505665825816210.plus.aac.p.m4a' }
    ]
  },
  {
    artist: 'Streetwise',
    tracks: [
      { title: 'Txantxangorria', externalId: 'n-9RN_E7L1k', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/58/b0/ca/58b0caaa-19c1-3f7e-3525-df44956ba943/mzaf_11699123269940345631.plus.aac.p.m4a' },
      { title: 'Izatea Baino', externalId: 'ZlZQAxqx2gE', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ad/bd/30/adbd30fa-7e11-9fc4-ee31-3e7afd0071ab/mzaf_1621266349327819936.plus.aac.p.m4a' }
    ]
  },
  {
    artist: 'Bizardunak',
    tracks: [
      { title: 'Nazi de Fresa', externalId: '0zI2goqPXLw', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/0e/3b/d1/0e3bd1df-bb37-81ca-baa4-bc26b5609471/mzaf_1363825328113959105.plus.aac.p.m4a' },
      { title: 'Shane McGowan\'s Basque Paddys', externalId: '98if3xXYNaQ', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/7d/66/70/7d6670eb-fbce-7187-4ea4-d72e1196972a/mzaf_17469467063648011767.plus.aac.p.m4a' }
    ]
  },
  {
    artist: 'Olaia Inziarte',
    tracks: [
      { title: 'Denbora Lehen Orain', externalId: 'bFeGyEIvJqw', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/32/7c/fe/327cfeea-0ef8-0ca5-b16f-9c600ff682fa/mzaf_4092370951689205369.plus.aac.p.m4a' }
    ]
  },
  {
    artist: 'Tatta',
    tracks: [
      { title: 'Muxutxo Bana', externalId: '4zpjzjJSZNk', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/01/78/2e/01782eef-f187-a20c-585f-04f261c9631d/mzaf_9971338142441165059.plus.aac.p.m4a' }
    ]
  },
  {
    artist: 'Belako',
    tracks: [
      { title: 'Render Me Numb', externalId: 'JD-IK47W3ok', previewUrlAlt: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/94/a1/75/94a17593-4112-0182-2911-acceffdc25ef/mzaf_3513018776870479321.plus.aac.p.m4a' }
    ]
  }
];

async function updateAll() {
  for (const item of GROUND_TRUTH_DATA) {
    for (const t of item.tracks) {
      const res = await pool.query(
        'UPDATE tracks SET external_id = , preview_url_alt = , source =  WHERE lower(title) = lower() AND lower(artist_name) LIKE lower()',
        [t.externalId, t.previewUrlAlt, 'youtube', t.title, '%' + item.artist + '%']
      );
      console.log(item.artist + ' - ' + t.title + ' updated: ' + res.rowCount);
    }
  }
  await pool.end();
}

updateAll();
