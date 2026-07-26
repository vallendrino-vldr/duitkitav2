/**
 * Evaluator aritmetika kecil untuk kalkulator nominal.
 *
 * Menggantikan `eval(calcValue)` yang lama: `eval` mengeksekusi kode apa pun yang
 * diketik pengguna dan melempar exception mentah pada input yang tidak lengkap
 * (mis. "1+"), yang sebelumnya menjatuhkan halaman Tambah Transaksi.
 *
 * Recursive descent, hanya mendukung + - * / dan tanda kurung.
 */
export function hitungEkspresi(input: string): number {
  const teks = input.replace(/\s+/g, '');
  if (!teks) throw new Error('Ekspresi kosong');
  if (!/^[0-9+\-*/().]+$/.test(teks)) throw new Error('Ekspresi tidak valid');

  let pos = 0;

  const lihat = () => teks[pos];
  const habis = () => pos >= teks.length;

  // ekspresi := suku (('+' | '-') suku)*
  function ekspresi(): number {
    let nilai = suku();
    while (!habis() && (lihat() === '+' || lihat() === '-')) {
      const op = teks[pos++];
      const kanan = suku();
      nilai = op === '+' ? nilai + kanan : nilai - kanan;
    }
    return nilai;
  }

  // suku := faktor (('*' | '/') faktor)*
  function suku(): number {
    let nilai = faktor();
    while (!habis() && (lihat() === '*' || lihat() === '/')) {
      const op = teks[pos++];
      const kanan = faktor();
      if (op === '/') {
        if (kanan === 0) throw new Error('Tidak bisa dibagi nol');
        nilai = nilai / kanan;
      } else {
        nilai = nilai * kanan;
      }
    }
    return nilai;
  }

  // faktor := ('+' | '-')? ( '(' ekspresi ')' | angka )
  function faktor(): number {
    if (habis()) throw new Error('Ekspresi tidak lengkap');

    if (lihat() === '+') { pos++; return faktor(); }
    if (lihat() === '-') { pos++; return -faktor(); }

    if (lihat() === '(') {
      pos++;
      const nilai = ekspresi();
      if (lihat() !== ')') throw new Error('Kurung tidak seimbang');
      pos++;
      return nilai;
    }

    const mulai = pos;
    while (!habis() && /[0-9.]/.test(lihat())) pos++;
    const potongan = teks.slice(mulai, pos);
    if (!potongan || !/^\d*\.?\d+$/.test(potongan)) throw new Error('Angka tidak valid');

    return parseFloat(potongan);
  }

  const hasil = ekspresi();
  if (!habis()) throw new Error('Ekspresi tidak valid');
  if (!Number.isFinite(hasil)) throw new Error('Hasil tidak valid');

  return hasil;
}
