export interface Material {
  no: string;
  topic: string;
  pokokBahasan: string;
  target: string;
  indikator: string;
  waktu: string;
  metode: string;
  optional?: boolean;
  aliases?: string[];
}

export const MATERIALS: Material[] = [
  {
    no: '1',
    topic: 'Screening',
    pokokBahasan:
      'Pendataan awal peserta, pengumpulan perangkat komunikasi (HP), konfirmasi kontak orang tua, dan kesiapan mengikuti seluruh rangkaian training.',
    target:
      'Memastikan kesiapan mental, fisik, dan administrasi peserta serta terbangunnya komitmen kedisiplinan sebelum memasuki kelas training.',
    indikator:
      'Peserta tertib mengikuti prosedur screening, menyerahkan HP sesuai aturan, dan siap berkomitmen mengikuti rangkaian LBT.',
    waktu: '',
    metode: 'Wawancara & Pengarahan',
  },
  {
    no: '2',
    topic: 'Ekspektasi 1 & 2',
    pokokBahasan:
      'Penggalian motivasi, identifikasi kelompok, dan penyusunan kesepakatan kelompok (kelas).',
    target:
      'Memahami perlunya kesamaan motivasi dan tujuan dalam mengikuti training; menyadari bahwa potensi pribadi dan peran positif peserta merupakan bagian tak terpisahkan dari kekuatan kelompok.',
    indikator:
      'Peserta dapat mengungkapkan motivasi dan tujuan mengikuti Basic Training; mulai saling mengenal; bersikap terbuka, berani, kritis, responsif, dan independen; serta menyepakati peraturan yang ditaati bersama selama training.',
    waktu: '180 Menit',
    metode: 'Group Dinamic (GD)',
    aliases: ['Ekspektasi I', 'Ekspektasi II', 'Ekspektasi 1', 'Ekspektasi 2'],
  },
  {
    no: '3',
    topic: 'Aqidah + Dinul Islam',
    pokokBahasan:
      'Hakikat Aqidah/Tauhid dan implikasinya terhadap pandangan hidup muslim (tujuan, tugas, fungsi hidup muslim), pengertian Dinul Islam, pokok-pokok ajaran Islam, serta sumber pokok ajaran Islam.',
    target:
      'Menghayati bahwa hanya Allah yang patut dipertuhankan sebagai sumber dan tujuan hidup; memahami hakikat dan totalitas ajaran Islam sebagai sistem nilai, pandangan hidup yang lengkap, universal, dan peningkatan kualitas hidup.',
    indikator:
      'Dapat menjelaskan hakikat tauhid beserta tujuan, tugas, dan fungsi hidup muslim; dapat menjelaskan pengertian, sistematika, dan sumber pokok Dinul Islam; serta menunjukkan sikap istiqamah terhadap Islam.',
    waktu: '150 Menit',
    metode: 'Brainstorming, Group Dinamic (GD) & Diskusi Komunikatif',
    aliases: ['Aqidah', 'Dienul Islam', 'Dinul Islam', 'Aqidah + Dienul Islam'],
  },
  {
    no: '4',
    topic: 'Self Introduction',
    pokokBahasan:
      'Identitas dan data pribadi, personal interest (hobi, cita-cita, pandangan hidup, yang disukai, yang dibenci, masalah khusus, kesan, dll).',
    target:
      'Memiliki keterbukaan dalam mengkomunikasikan pendirian dengan orang lain, memahami keragaman latar belakang yang membentuk kepribadian, serta memiliki kedisiplinan, keseriusan, dan antusiasme dalam mengikuti training.',
    indikator:
      'Mau mengungkapkan persoalan pribadinya, menerima pendapat orang lain, bersedia memperbaiki pendirian yang keliru, hadir tepat waktu, tertib keluar-masuk lokal, dan memperhatikan jalannya acara dengan saksama.',
    waktu: '',
    metode: 'Group Dinamic (GD)',
  },
  {
    no: '5',
    topic: 'Kuliah Shubuh: Ibadah Filosofis',
    pokokBahasan:
      'Pengertian ibadah dalam Islam, kandungan filosofis ibadah, peran ibadah membentuk watak dan kepribadian teguh, syarat utama ibadah (ikhlas), makna ikhlas dan ihsan, serta hambatan internal dan eksternal dalam beribadah.',
    target:
      'Menyadari bahwa seluruh aktivitas hidup bernilai ibadah berdasarkan niat, tujuan, dan cara menjalankannya; memahami konsepsi ibadah yang selaras dengan fitrah manusia; serta terdorong menggali hikmah ibadah.',
    indikator:
      'Dapat menjelaskan pengertian ibadah secara filosofis, cara mencapai kekhusyukan dalam beribadah, dan cara mengatasi hambatan beribadah.',
    waktu: '80 Menit',
    metode: 'Ceramah',
    aliases: ['Kulsub (Ibadah Filosofis)', 'Kuliah Shubuh “Ibadah Filosofis”', 'Ibadah Filosofis'],
  },
  {
    no: '6',
    topic: 'Sirah Nabawiyah',
    pokokBahasan:
      'Periode sebelum kenabian, peristiwa hijrah Rasulullah, periode kenabian Rasulullah, dan Piagam Madinah.',
    target:
      'Memahami perikehidupan dan perjuangan Rasulullah dalam perspektif historis serta termotivasi meneladani kepribadian Rasulullah dalam kehidupan pribadi, keluarga, dan masyarakat.',
    indikator:
      'Dapat menjelaskan fase-fase kehidupan Rasulullah (sebelum kenabian, pengangkatan Nabi, hijrah, hingga Piagam Madinah) serta menyebutkan dan menerapkan sifat-sifat Rasul dalam keseharian.',
    waktu: '180 Menit',
    metode: 'GD Informasi',
    aliases: ['Shirah Nabawiyah'],
  },
  {
    no: '7',
    topic: 'Pengantar Leadership',
    pokokBahasan:
      'Pengertian dan syarat pemimpin, klasifikasi pemimpin, serta karakter pokok kepemimpinan Rasulullah.',
    target:
      'Memahami pengertian, syarat, klasifikasi proses dan sifat-sifat pemimpin, serta konsep pemimpin ideal menurut Al-Qur’an dan Sunnah Nabi SAW.',
    indikator:
      'Dapat menjelaskan pengertian, peran, dan fungsi pemimpin; tiga gaya kepemimpinan beserta aplikasinya; kepemimpinan situasional; serta mengembangkan karakter dasar kepemimpinan Rasulullah.',
    waktu: '180 Menit',
    metode: 'GD Game',
  },
  {
    no: '8',
    topic: 'SPUII (Sejarah Perjuangan Umat Islam Indonesia)',
    pokokBahasan:
      'Proses masuknya Islam ke Indonesia, faktor pendorong penyebaran Islam, Kesultanan Malikus Saleh di Aceh, Maulana Malik Ibrahim & Wali Songo, peranan umat Islam dalam kemerdekaan, munculnya organisasi Islam, hingga masa penjajahan Jepang dan persiapan kemerdekaan (BPUPKI & PPKI).',
    target:
      'Memahami sejarah masuknya Islam ke Indonesia, dinamika dakwah, peranan organisasi Islam dalam perjuangan kemerdekaan dan kemajuan bangsa, serta kesadaran melaksanakan dakwah secara sistematis.',
    indikator:
      'Dapat menjelaskan proses masuknya Islam ke Indonesia, kekuatan dan kelemahan perjuangan umat Islam, serta mengajukan alternatif perbaikan dakwah untuk kemajuan Islam dan bangsa.',
    waktu: '150 Menit',
    metode: 'Informatif Dialog',
    aliases: ['SPUII'],
  },
  {
    no: '9',
    topic: 'Manajemen',
    pokokBahasan: 'Pengertian manajemen, fungsi-fungsi manajemen, dan unsur-unsur manajemen.',
    target:
      'Memahami prinsip, fungsi, dan unsur manajemen serta menyadari pentingnya penguasaan manajemen secara teoritis maupun praktis.',
    indikator:
      'Dapat menjelaskan pengertian manajemen dan fungsi-fungsinya dalam penyelenggaraan kegiatan serta menjelaskan unsur-unsur manajemen program sebagai suatu jaringan.',
    waktu: '210 Menit',
    metode: 'Group Dinamic (GD) Praktek',
  },
  {
    no: '10',
    topic: 'Pengantar Organisasi',
    pokokBahasan:
      'Pengertian organisasi, unsur-unsur organisasi, bentuk dan sifat organisasi, independensi dan Catur Bakti PII, serta dasar-dasar security organisasi.',
    target:
      'Memahami bentuk dan sifat organisasi, independensi PII sebagai media berlatih, sukses studi, berjuang dan kader umat, serta pentingnya security bagi stabilitas organisasi.',
    indikator:
      'Dapat menunjukkan ciri organisasi independen, menyebutkan manfaat aktif di PII, dan menjelaskan pentingnya security bagi kelangsungan organisasi.',
    waktu: '120 Menit',
    metode: 'GD',
  },
  {
    no: '11',
    topic: 'Kuliah Shubuh: Akhlak',
    pokokBahasan:
      'Pengertian akhlak, alasan manusia berakhlak, sumber-sumber akhlak dan cakupan objek akhlak, serta akhlak karimah dan akhlak mazmumah.',
    target:
      'Menyadari bahwa maksud Islam diturunkan adalah menyempurnakan akhlak manusia; memahami sumber dan cakupan ajaran akhlak; serta mengaktualisasikan akhlak karimah sebagai kader.',
    indikator:
      'Dapat membedakan akhlak baik dan buruk serta berkomitmen meluruskan dan meningkatkan pelaksanaan akhlak karimah.',
    waktu: '180 Menit',
    metode: 'Ceramah',
    aliases: ['Akhlak', 'Kuliah Shubuh “Akhlak”'],
  },
  {
    no: '12',
    topic: 'Komunikasi Efektif',
    pokokBahasan:
      'Asas komunikasi antarmanusia, komunikasi satu dan dua arah, serta keterampilan berbicara dan mendengar yang baik.',
    target:
      'Memahami bahwa komunikasi dua arah secara komunikatif dan seimbang memperlancar penyampaian pesan serta menyadari perlunya persiapan dan pengembangan keterampilan komunikasi dasar.',
    indikator:
      'Dapat menjelaskan keunggulan komunikasi dua arah dibanding satu arah serta prinsip dasar komunikasi interpersonal dan publik.',
    waktu: '90 Menit',
    metode: 'ID Praktek',
  },
  {
    no: '13',
    topic: 'BG PII + Lagu PII (Background Berdirinya PII)',
    pokokBahasan:
      'Kondisi politik dan pendidikan Indonesia menjelang kebangkitan PII, kondisi masyarakat Islam, tantangan organisasi pelajar non-Islam (IPI), proses berdirinya PII (tujuan dan tokoh-tokohnya), serta pengenalan Mars/Lagu PII.',
    target:
      'Menghayati proses dan semangat bangkitnya PII serta termotivasi mewujudkan tujuan PII sebagai anggota maupun pengurus.',
    indikator:
      'Dapat menjelaskan kondisi politik, pendidikan, dan latar konflik ideologi awal berdirinya PII; hafal/mengenal lagu perjuangan PII; serta terdorong aktif dalam kegiatan PII.',
    waktu: '90 Menit',
    metode: 'Informatif Diskusi (ID)',
    aliases: ['Background Berdirinya PII', 'BG PII + Lagu PII (Mars PII)', 'BG PII'],
  },
  {
    no: '14',
    topic: 'SP PII (Sejarah Perjuangan PII)',
    pokokBahasan:
      'Tahap-tahap perkembangan PII: masa revolusi fisik, PII dan PKI Madiun, PII dan Pemilu 1955, PII pada masa Orde Lama, serta PII pada masa Orde Baru.',
    target:
      'Memahami pokok perkembangan PII dalam menghadapi berbagai tantangan dan ujian berat tokoh-tokohnya demi tegaknya misi organisasi serta menyadari PII sebagai mata rantai perjuangan umat Islam.',
    indikator:
      'Dapat menjelaskan periode perjuangan PII dari revolusi fisik hingga Orde Baru serta menemukan akar persoalan yang menghambat perkembangan PII.',
    waktu: '150 Menit',
    metode: 'Informatif Diskusi (ID)',
    aliases: ['Sejarah Perjuangan PII', 'SP PII'],
  },
  {
    no: '15',
    topic: 'KP + Lagu PII (Khittah Perjuangan PII)',
    pokokBahasan:
      'Pengertian dan fungsi Khittah Perjuangan PII, sejarah lahirnya Khittah Perjuangan PII, isi Khittah Perjuangan PII, serta penghayatan Lagu PII.',
    target:
      'Memahami fungsi Khittah Perjuangan PII dalam hubungannya dengan misi dan program-program organisasi PII.',
    indikator:
      'Dapat menunjukkan posisi Khittah Perjuangan dalam kerangka konstitusi PII serta mengenali kebijakan atau perilaku berorganisasi yang menyimpang dari Khittah Perjuangan PII.',
    waktu: '120 Menit',
    metode: 'Informatif Diskusi (ID), Studi Kasus',
    aliases: ['Khittah Perjuangan PII', 'KP (Lagu PII)', 'KP'],
  },
  {
    no: '16',
    topic: 'Personal Introduction',
    pokokBahasan:
      'Pengenalan diri dan potensi (identitas, personal interest, kelebihan dan kelemahan diri/teman) serta dimensi keorganisasian (Catur Bakti PII dan pengalaman aktivitas PII secara personal).',
    target:
      'Peserta mampu memahami jati diri dan potensinya, sadar akan pentingnya sukses studi bagi kader PII sebagai manifestasi tugas kekhalifahan, serta memahami PII sebagai media berlatih, sukses studi, alat berjuang, dan pembentukan kader umat.',
    indikator:
      'Dapat mengenalkan kelebihan dan kelemahan diri maupun potensi temannya; dapat menjelaskan fungsi Catur Bakti PII dan manfaat berorganisasi; serta mampu mengatur keseimbangan studi dan organisasi.',
    waktu: '180 Menit',
    metode: 'Brainstorming, Group Dinamic (GD) & Diskusi Komunikatif',
    aliases: [
      'Personal Introduction (Pengenalan Diri dan Potensi)',
      'Personal Introduction (Keorganisasian)',
    ],
  },
  {
    no: '17',
    topic: 'Kuliah Shubuh: Misi dan Eksistensi PII',
    pokokBahasan: 'Tri Komitmen PII dan Tafsir Tujuan Organisasi PII.',
    target:
      'Memahami problematika organisasi PII di tingkat Komisariat dan Daerah, serta termotivasi menggairahkan aktivitas dan meningkatkan kualitas diri dalam wahana kaderisasi PII.',
    indikator:
      'Dapat mengidentifikasi persoalan kepelajaran dan persoalan PII di daerah masing-masing serta mengaplikasikan Tri Komitmen, tujuan, dan Catur Bakti PII dalam memetakan solusi.',
    waktu: '150 Menit',
    metode: 'Brainstorming / Ceramah',
    aliases: ['Misi dan Eksistensi PII', 'Kuliah Shubuh “Misi dan Eksistensi”'],
  },
  {
    no: '18',
    topic: 'Perbandingan Ideologi (Per-Ideologi)',
    pokokBahasan:
      'Pengertian ideologi, unsur-unsur ideologi Islam, dan perbandingan dengan ideologi-ideologi besar di dunia.',
    target:
      'Memahami hakikat ideologi sebagai penggerak masyarakat, sistematika ideologi besar dunia, serta meyakini Islam sebagai ideologi yang memberi solusi paripurna bagi persoalan kehidupan.',
    indikator:
      'Dapat menjelaskan pengertian dan sistematika ideologi besar dunia, memberikan argumentasi logis keunggulan ideologi Islam, serta peka terhadap gerakan ideologi di masyarakat.',
    waktu: '240 Menit',
    metode: 'Group Dinamic (GD) & Informasi Diskusi (ID)',
    aliases: ['Perbandingan Idiologi', 'Per-Ideologi', 'Perbandingan Ideologi'],
  },
  {
    no: '19',
    topic: 'Case Moral (Generasi Muda)',
    pokokBahasan: 'Problem solving persoalan moral dan sosial generasi muda.',
    target:
      'Peserta memahami berbagai permasalahan aktual yang dihadapi generasi muda dan mampu merumuskan solusi yang tepat.',
    indikator:
      'Peserta dapat menganalisis kasus aktual di lingkungan sekitar dan menawarkan beberapa pendekatan penyelesaian masalah secara kritis.',
    waktu: '',
    metode: 'Studi Kasus & Diskusi',
    aliases: ['Case Moral'],
  },
  {
    no: '20',
    topic: 'AD/ART + Lagu PII',
    pokokBahasan:
      'Pengertian dan fungsi AD/ART PII, hubungan Muqaddimah dan isi AD/ART, hubungan dasar, tujuan, dan usaha, sikap kader terhadap AD/ART PII, serta Lagu PII.',
    target:
      'Meyakini keseriusan berorganisasi di PII untuk aktualisasi masa depan serta menyadari pentingnya menaati kaidah dan konstitusi organisasi.',
    indikator:
      'Dapat menerangkan arti dan kandungan AD/ART PII, menjelaskan keterkaitan antarbagiannya, serta menumbuhkan sikap taat dan berani menegakkan ketentuan organisasi.',
    waktu: '120 Menit',
    metode: 'Informasi Diskusi (ID)',
    aliases: ['Anggaran Dasar dan Anggaran Rumah Tangga PII.', 'AD/ART PII', 'AD/ART'],
  },
  {
    no: '21',
    topic: 'Perbandingan Agama',
    pokokBahasan: 'Perbandingan sistem ajaran agama samawi dan ardhi.',
    target:
      'Peserta mengembangkan sikap istiqamah dan syumuliyah (kamilah) dalam berislam sekaligus mampu mengembangkan toleransi sosial di masyarakat.',
    indikator:
      'Peserta mengetahui pokok ajaran berbagai agama dan perbedaannya dengan Islam, dapat menjelaskan klasifikasi agama, serta menyadari pentingnya menjaga kemurnian akidah Islam.',
    waktu: '',
    metode: 'Informasi Diskusi (ID)',
  },
  {
    no: '22',
    topic: 'TFR + Jihad + Lagu PII',
    pokokBahasan:
      'Dasar-dasar analisis tingkah laku (Topik, Feeling, dan Respon), dasar-dasar Jihad fisabilillah, serta Lagu PII.',
    target:
      'Peserta memahami aspirasi (pikiran dan perasaan) diri sendiri dan orang lain di lingkungan organisasi agar peka terhadap kebutuhan dan problem yang berlangsung, sekaligus memahami hakikat jihad dan implikasinya dalam kehidupan sehari-hari.',
    indikator:
      'Peserta mampu membaca proses di balik tingkah laku dan menanggapi persoalan secara cepat dan tepat; dapat menjelaskan pengertian dan jenis-jenis jihad secara leksikal maupun hakikat; serta menumbuhkan militansi dan istiqamah dalam menegakkan Islam.',
    waktu: '120 Menit',
    metode: 'Informasi Diskusi (ID) & Analisis Kasus',
    aliases: ['Topik, Feeling dan Respon', 'Jihad', 'TFR + Jihad'],
  },
  {
    no: '23',
    topic: 'Kuliah Shubuh: Zakat, Infaq dan Sadaqah (ZIS)',
    pokokBahasan:
      'Pengertian ZIS, dasar disyariatkannya ZIS, ZIS sebagai basis pengembangan ekonomi Islam, serta kesadaran dan aplikasi ZIS bagi kader.',
    target:
      'Memahami ZIS sebagai basis ekonomi Islam dan menyadari pentingnya sosialisasi serta aplikasi ZIS.',
    indikator:
      'Dapat menjelaskan pengertian dan dasar syariat ZIS, memberi argumentasi peran ZIS dalam perekonomian Islam, serta menggambarkan praktik dan inovasi ZIS di masyarakat.',
    waktu: '90 Menit',
    metode: 'Ceramah & Praktek',
    aliases: ['Zakat, Infaq dan Sadaqah (ZIS)', 'Kuliah Shubuh (ZIS)', 'ZIS'],
  },
  {
    no: '24',
    topic: 'Pengantar Audiensi',
    pokokBahasan:
      'Pembekalan metodis dan teknis survei lapangan, pembagian peran, etika komunikasi, serta security sebelum pelaksanaan audiensi.',
    target:
      'Peserta mampu mempersiapkan dan melaksanakan survei lapangan/audiensi secara metodis dan praktis berdasarkan acuan persoalan.',
    indikator:
      'Peserta memahami acuan persoalan dakwah yang akan digali serta siap mempraktikkan pengalaman belajar dalam audiensi lapangan.',
    waktu: '',
    metode: 'Pengarahan & Simulasi',
    aliases: ['Pengantar Audiensi dan Audiensi'],
  },
  {
    no: '25',
    topic: 'Audiensi + Persiapan Presentasi',
    pokokBahasan:
      'Pelaksanaan audiensi lapangan, pengolahan data hasil temuan, serta penyusunan laporan dan bahan presentasi kelompok.',
    target:
      'Peserta mampu mempraktikkan survei lapangan secara konkret dan mengembangkan keterampilan menulis serta menyusun laporan hasil audiensi secara sistematis.',
    indikator:
      'Peserta melaksanakan audiensi dengan baik, mampu mengolah data temuan menjadi laporan sistematis, dan menunjukkan kerja sama kelompok yang harmonis.',
    waktu: '',
    metode: 'Praktek Lapangan & Kerja Kelompok',
    aliases: ['Penyusunan Laporan Audiensi', 'Audiensi'],
  },
  {
    no: '26',
    topic: 'Presentasi Hasil Audiensi',
    pokokBahasan:
      'Pemaparan dan diskusi kritis hasil audiensi kelompok beserta evaluasi kepemimpinan, manajemen, security, dan analisis laporan.',
    target:
      'Peserta mampu mengembangkan pengetahuan, pemahaman, keterampilan, sikap, dan nilai dari pengalaman belajar audiensi lapangan.',
    indikator:
      'Peserta dapat mengidentifikasi kelemahan kepemimpinan, manajemen, pemeliharaan security, analisis penulisan, serta dampak kerja sama dan komunikasi selama audiensi.',
    waktu: '',
    metode: 'Presentasi & Diskusi Panel',
    aliases: ['Diskusi Hasil Audiensi', 'Presentasi + Presensi'],
  },
  {
    no: '27',
    topic: 'Muhasabah + Ikrar + Tahajud',
    pokokBahasan:
      'Muhasabah eksistensi manusia sebagai khalifatul fil ardh, tugas pendakwah, akhlak keseharian, pergaulan, bakti kepada orang tua dan guru, esensi taubatan nasuha, ikrar kader, dan sholat tahajud.',
    target:
      'Menyadari pentingnya sukses studi, meneladani kepemimpinan Rasulullah, meyakini Islam sebagai Way of Life, memahami tantangan ideologi, dan meneguhkan komitmen perjuangan kader.',
    indikator:
      'Peserta menginternalisasi nilai-nilai training serta merefleksikan peran konkret yang akan dijalankan sepulang training.',
    waktu: '90 Menit',
    metode: 'Refleksi & Spiritual',
    aliases: ['Clossing Session Muhasabah (Evaluasi Diri)', 'Muhasabah+Ikrar+Tahajud'],
  },
  {
    no: '28',
    topic: 'Kuliah Shubuh: Khutbah Wada',
    pokokBahasan:
      'Pesan-pesan pokok Khutbah Wada Rasulullah SAW, nilai kemanusiaan, persaudaraan Islam, amanah dakwah, dan pegangan hidup (Al-Qur’an & Sunnah).',
    target:
      'Menghayati wasiat agung Rasulullah SAW sebagai bekal moral dan arah gerak kader setelah menyelesaikan Leadership Basic Training.',
    indikator:
      'Peserta mampu merangkum nilai utama Khutbah Wada dan menjadikannya pedoman sikap dalam kehidupan berorganisasi dan bermasyarakat.',
    waktu: '75 Menit',
    metode: 'Ceramah & Refleksi',
    aliases: ['Kuliah Shubuh : Khutbah Wada', 'Khutbah Wada'],
  },
  {
    no: '29',
    topic: 'Problem Solving + Lagu PII',
    pokokBahasan:
      'Studi kasus-kasus yang terjadi selama interaksi kelas (medan training) serta penguatan kebersamaan melalui Lagu PII.',
    target:
      'Meluruskan, menetralisasi, dan membenahi problem perilaku pribadi selama training; menumbuhkan kesadaran evaluasi diri; serta membangun solidaritas dan keterbukaan.',
    indikator:
      'Peserta mampu berintrospeksi diri, saling memaafkan, dan menyelesaikan konflik kelas secara dewasa.',
    waktu: '120 Menit',
    metode: 'Group Dinamic (GD), Interview & Refleksi',
    aliases: ['Problem Solving'],
  },
  {
    no: '30',
    topic: 'Ngaji Bareng + Ta’aruf & Evaluasi Instruktur dan Panitia + Members Group',
    pokokBahasan:
      'Tilawah bersama, perkenalan dan evaluasi panitia, perkenalan instruktur dan tugas tulis evaluasi, serta pembentukan Members Group tindak lanjut pascatraining.',
    target:
      'Menumbuhkan sikap terbuka, jujur, berani, kritis, dan independen dalam memberi dan menerima evaluasi; meluruskan motivasi ber-PII; serta memahami pentingnya tindak lanjut kaderisasi (kelompok kerja/komisariat/jenjang lanjutan).',
    indikator:
      'Peserta memberi evaluasi konstruktif bagi panitia dan instruktur, menjalin silaturahmi antarkader, serta tergabung dalam Members Group dengan komitmen tindak lanjut.',
    waktu: '180 Menit',
    metode: 'Group Dinamic (GD), Refleksi & Evaluasi',
    aliases: [
      'Perkenalan dan Evaluasi Panitia',
      'Perkenalan Instruktur (dan tugas tulis evaluasi)',
      'Pembentukan Members Group',
    ],
  },
  {
    no: '31',
    topic: 'Islam dan Ilmu Pengetahuan (Opsional)',
    pokokBahasan:
      'Pengertian dan fungsi ilmu pengetahuan, kedudukan ilmu dalam Islam, landasan pengembangan ilmu, prestasi sejarah Islam dalam IPTEK, dan pentingnya penguasaan ilmu bagi kader PII.',
    target:
      'Memahami kedudukan ilmu pengetahuan dalam Islam serta menyadari pentingnya prestasi studi dan minat baca untuk kemajuan Islam.',
    indikator:
      'Dapat menjelaskan kedudukan ilmu berdasarkan dalil naqli & aqli, sejarah tokoh IPTEK Islam, serta menunjukkan motivasi peningkatan prestasi studi.',
    waktu: '150 Menit',
    metode: 'Group Dinamic (GD)',
    optional: true,
    aliases: ['Islam dan Ilmu Pengetahuan'],
  },
  {
    no: '32',
    topic: 'Security (Opsional)',
    pokokBahasan:
      'Pengertian security, kegunaan security dalam organisasi, dan tingkah laku memelihara security organisasi.',
    target:
      'Mampu berkomunikasi dengan berbagai kalangan tanpa membocorkan rahasia organisasi serta memahami pengaruh politik praktis terhadap independensi PII.',
    indikator:
      'Dapat menggambarkan konsep security secara tertulis dan praktik serta menunjukkan cara menjaga independensi program PII dari politik praktis.',
    waktu: '60 Menit',
    metode: 'Studi Kasus',
    optional: true,
    aliases: ['Security'],
  },
];

export function findMaterialByTopic(topic?: string | null): Material | undefined {
  const clean = String(topic || '').trim();
  if (!clean) return undefined;
  const lower = clean.toLowerCase();
  return MATERIALS.find(
    (item) =>
      item.topic.toLowerCase() === lower ||
      (item.aliases || []).some((alias) => alias.toLowerCase() === lower),
  );
}
