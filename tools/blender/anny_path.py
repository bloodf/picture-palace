import os, sys, glob
DATA=os.environ.get('MPFB_DATA') or (glob.glob(os.path.join(sys.prefix,'lib/python3*/site-packages/anny/data/mpfb2'))+[''])[0]
