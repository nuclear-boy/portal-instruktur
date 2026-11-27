from __future__ import annotations

ASSESSMENT_GROUPS = [
    {
        "key": "penampilan",
        "label": "Penampilan",
        "items": [
            {"key": "suara", "label": "Suara"},
            {"key": "cara_berpakaian", "label": "Cara Berpakaian"},
            {"key": "sikap_gaya", "label": "Sikap & Gaya"},
            {"key": "ekspresi_wajah", "label": "Ekspresi Wajah"},
        ],
    },
    {
        "key": "bahasa",
        "label": "Bahasa",
        "items": [
            {"key": "tata_bahasa", "label": "Tata Bahasa"},
            {"key": "kosa_kata", "label": "Pemilihan Kosa Kata"},
            {"key": "kemudahan_memahami", "label": "Kemudahan Memahami Kalimat"},
            {"key": "sistematika_kalimat", "label": "Sistematika Kalimat"},
        ],
    },
    {
        "key": "materi",
        "label": "Materi",
        "items": [
            {"key": "penguasaan_materi", "label": "Penguasaan Materi"},
            {"key": "sistematika_pembahasan", "label": "Sistematika Pembahasan"},
            {"key": "metode_penyampaian", "label": "Metode Penyampaian"},
            {"key": "persiapan", "label": "Persiapan"},
        ],
    },
]

ASSESSMENT_ITEMS = [item for group in ASSESSMENT_GROUPS for item in group["items"]]
