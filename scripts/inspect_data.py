import zipfile, gzip, io
from astropy.io import fits
import datetime

with zipfile.ZipFile('data/raw/solexs/AL1_SLX_L1_20240901_v1.1.zip') as z:
    name = [n for n in z.namelist() if n.endswith('.lc.gz')][0]
    print('FILE:', name)
    raw = z.read(name)
    decompressed = gzip.decompress(raw)
    with fits.open(io.BytesIO(decompressed)) as hdul:
        data = hdul['RATE'].data
        print('TIME sample:', list(data['TIME'][:5]))
        print('COUNTS sample:', list(data['COUNTS'][:5]))
        t0 = data['TIME'][0]
        dt = datetime.datetime.fromtimestamp(t0, tz=datetime.timezone.utc)
        print(f'TIME[0] = {t0} -> datetime: {dt}')
        print(f'Total rows: {len(data)}')
        diffs = data['TIME'][1:100] - data['TIME'][:99]
        print(f'Mean cadence: {diffs.mean():.3f}s')

# Also check HEL1OS
with zipfile.ZipFile('data/raw/hel1os/HLS_20240901_000006_43190sec_lev1_V111.zip') as z:
    for name in z.namelist():
        if 'lightcurve_czt1.fits' in name:
            raw = z.read(name)
            with fits.open(io.BytesIO(raw)) as hdul:
                ext = hdul['CZT1_LC_BAND_18.00KEV_TO_160.00KEV']
                data = ext.data
                print(f'\nHEL1OS CZT1 TOTAL BAND:')
                print('ISOT sample:', list(data['ISOT'][:5]))
                print('CTR sample:', list(data['CTR'][:5]))
                print('MJD sample:', list(data['MJD'][:5]))
                print(f'Total rows: {len(data)}')
