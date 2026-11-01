// Curated artist affinities used as a low-confidence fallback when the
// behavioural signals (session co-play, genre, region) are too thin.
//
// Keys/values are normalized with `normalizeArtistName` before lookup, so
// casing, accents and featured-artist suffixes do not matter.

export const CURATED_RELATED_ARTISTS: Record<string, string[]> = {
  // Basque Urban / Trap / Pop
  "bengo": ["Tatta", "Kixka", "ZETAK", "Malakias", "Chill Mafia", "Dupla", "Merina Gris", "Bulego", "ETS"],
  "tatta": ["Bengo", "Kixka", "Chill Mafia", "Malakias", "Dupla", "ZETAK", "Merina Gris"],
  "chill mafia": ["Dupla", "Tatta", "Bengo", "Merina Gris", "Hofmann", "ZETAK", "Kixka"],
  "zetak": ["Bulego", "ETS", "Bengo", "Huntza", "Merina Gris", "Neomak", "Dupla", "Izaro", "Tatta"],
  "bulego": ["ZETAK", "ETS", "Izaro", "Huntza", "Shinova", "Dupla", "Bengo", "Merina Gris"],
  "en tol sarmiento": ["Bulego", "ZETAK", "Huntza", "Gatibu", "Esne Beltza", "Vendetta", "Skakeitan", "La Txama"],
  "ets": ["Bulego", "ZETAK", "Huntza", "Gatibu", "Esne Beltza", "Vendetta", "Skakeitan", "La Txama"],
  "huntza": ["ETS", "ZETAK", "Bulego", "Izaro", "Neomak", "Gatibu", "Esne Beltza", "La Txama"],
  "dupla": ["Chill Mafia", "ZETAK", "Bengo", "Tatta", "Merina Gris", "Skakeitan", "Bulego"],
  "merina gris": ["ZETAK", "Bulego", "Dupla", "Chill Mafia", "Belako", "Bengo"],
  "neomak": ["Huntza", "ZETAK", "Oreka TX", "Kepa Junkera", "Izaro"],
  "la txama": ["Huntza", "Skakeitan", "Esne Beltza", "Vendetta", "ETS", "Gose"],

  // Basque Indie / Folk / Acoustic
  "izaro": ["Olaia Inziarte", "Idoia", "Anari", "Eñaut Elorrieta", "Olatz Salvador", "Bulego", "ZETAK", "Mikel Urdangarin"],
  "olaia inziarte": ["Izaro", "Idoia", "Anari", "Olatz Salvador", "Eñaut Elorrieta", "Liher", "Merina Gris"],
  "anari": ["Izaro", "Olaia Inziarte", "Mikel Laboa", "Ruper Ordorika", "Lisabö", "Belako", "Mursego"],
  "idoia": ["Izaro", "Olaia Inziarte", "Eñaut Elorrieta", "Olatz Salvador", "Mikel Urdangarin"],
  "eñaut elorrieta": ["Ken Zazpi", "Izaro", "Mikel Urdangarin", "Idoia", "Olatz Salvador", "Anari"],
  "olatz salvador": ["Izaro", "Olaia Inziarte", "Idoia", "Eñaut Elorrieta", "Skakeitan"],
  "mikel laboa": ["Benito Lertxundi", "Xabier Lete", "Ruper Ordorika", "Oskorri", "Anari", "Kepa Junkera", "Lourdes Iriondo"],
  "benito lertxundi": ["Mikel Laboa", "Xabier Lete", "Lourdes Iriondo", "Oskorri", "Imanol", "Ruper Ordorika", "Pantxoa eta Peio"],
  "oskorri": ["Kepa Junkera", "Mikel Laboa", "Benito Lertxundi", "Oreka TX", "Tapia eta Leturia"],
  "kepa junkera": ["Oreka TX", "Oskorri", "Mikel Laboa", "Tapia eta Leturia", "Neomak", "Huntza"],
  "oreka tx": ["Kepa Junkera", "Neomak", "Oskorri", "Mikel Laboa", "Huntza"],
  "ruper ordorika": ["Mikel Laboa", "Benito Lertxundi", "Anari", "Itoiz", "Hertzainak"],

  // Basque Rock / Punk / Post-Punk / Metal
  "berri txarrak": ["Zea Mays", "Gatibu", "Su Ta Gar", "Kuraia", "Lisabö", "Belako", "Willis Drummond", "Hertzainak", "Kortatu"],
  "belako": ["Lukiek", "Vulk", "Willis Drummond", "Berri Txarrak", "Merina Gris", "Zea Mays", "Shinova"],
  "lukiek": ["Belako", "Vulk", "Willis Drummond", "Berri Txarrak", "Zea Mays"],
  "gatibu": ["Berri Txarrak", "Zea Mays", "ETS", "Shinova", "Doctor Deseo", "Hesian", "Vendetta"],
  "zea mays": ["Berri Txarrak", "Gatibu", "Doctor Deseo", "Belako", "Shinova", "Anari", "Su Ta Gar"],
  "su ta gar": ["Berri Txarrak", "Latzen", "EH Sukarra", "Etsaiak", "Zea Mays"],
  "streetwise": ["Brigade Loco", "Bizardunak", "Rotten XIII", "Kaleko Urdangak", "Kortatu", "Hertzainak", "Negu Gorriak"],
  "bizardunak": ["Streetwise", "Brigade Loco", "Rotten XIII", "The Pogues", "Dropkick Murphys", "Kortatu", "Hertzainak", "Skakeitan"],
  "brigade loco": ["Streetwise", "Rotten XIII", "Kaleko Urdangak", "Bizardunak", "Kortatu"],
  "rotten xiii": ["Brigade Loco", "Streetwise", "Kaleko Urdangak", "Bizardunak"],
  "kortatu": ["Negu Gorriak", "Hertzainak", "Barricada", "La Polla Records", "Eskorbuto", "Bizardunak", "Streetwise"],
  "negu gorriak": ["Kortatu", "Hertzainak", "Dut", "Fermin Muguruza", "Berri Txarrak"],
  "hertzainak": ["Kortatu", "Negu Gorriak", "Itoiz", "Doctor Deseo", "Zea Mays", "Berri Txarrak"],
  "doctor deseo": ["Zea Mays", "Gatibu", "Hertzainak", "Itoiz", "Fito & Fitipaldis", "Shinova"],
  "itoiz": ["Hertzainak", "Mikel Laboa", "Ruper Ordorika", "Doctor Deseo", "Zea Mays"],
  "shinova": ["Zea Mays", "Doctor Deseo", "Gatibu", "Vetusta Morla", "Izal", "Love of Lesbian", "Berri Txarrak"],
  "skakeitan": ["Vendetta", "Esne Beltza", "ETS", "Huntza", "La Txama", "Glaukoma", "Dupla"],
  "esne beltza": ["Vendetta", "Skakeitan", "ETS", "Huntza", "Gose", "Fermin Muguruza", "La Txama"],
  "vendetta": ["Esne Beltza", "Skakeitan", "ETS", "Huntza", "Gose", "La Txama", "Gatibu"],
  "glaukoma": ["Skakeitan", "Esne Beltza", "Bad Sound System", "Dupla", "Chill Mafia"],

  // Global Rock / Pop / Indie Folk
  "arctic monkeys": ["The Strokes", "Franz Ferdinand", "Miles Kane", "The Last Shadow Puppets", "Foals", "Kasabian"],
  "the strokes": ["Arctic Monkeys", "The White Stripes", "Franz Ferdinand", "Interpol", "Phoenix", "The Killers"],
  "dua lipa": ["Olivia Rodrigo", "Aitana", "Rosalía", "The Weeknd", "Harry Styles", "Taylor Swift", "Billie Eilish"],
  "rosalía": ["C. Tangana", "Dua Lipa", "Aitana", "Nathy Peluso", "Bad Bunny", "Fred again.."],
  "bon iver": ["Ben Howard", "Passenger", "Boygenius", "Fleet Foxes", "Phoebe Bridgers", "Sufjan Stevens", "Khruangbin"],
  "boygenius": ["Phoebe Bridgers", "Julien Baker", "Lucy Dacus", "Bon Iver", "Big Thief", "Mitski"],
};
