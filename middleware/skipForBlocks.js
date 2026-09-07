export function skipForBlocks(...middlewares) {
    return (req, res, next) => {
      const bypass = req.body?.type === 'block' || req.body?.type === 'clone_block';
      if (bypass) return next(); // saltar validaciones
  
      // si no es bloque, ejecutamos los middlewares originales
      let i = 0;
      const run = () => {
        const mw = middlewares[i++];
        if (!mw) return next();
        mw(req, res, run);
      };
      run();
    };
  }
  