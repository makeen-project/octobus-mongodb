export const hasRefCachePointers = (references) => (
  Array.isArray(references) && references.some(({ cache }) => Object.keys(cache).length)
);

export const generateRefCache = ({ dispatch, references, data }) => {
  const findRefData = (refId, refEntity) => {
    if (Array.isArray(refId)) {
      return dispatch(`entity.${refEntity}.findMany`, {
        query: {
          _id: {
            $in: refId,
          },
        },
      }).then((c) => c.toArray());
    }

    return dispatch(`entity.${refEntity}.findOne`, {
      query: {
        _id: refId,
      },
    });
  };

  const reduceRefData = (cacheProperties, refData) => (
    cacheProperties.reduce(
      (acc, property) => ({
        ...acc,
        [property]: refData[property],
      }),
      {},
    )
  );

  const promises = references
    .filter(({ cache, refId }) => Object.keys(cache).length && data && data[refId])
    .map(({ refId, refEntity, cache }) => {
      const isListRef = Array.isArray(data[refId]);

      return findRefData(data[refId], refEntity)
        .then((refData) => ({
          [cache.under]: isListRef ?
            refData.map((item) => reduceRefData(cache.properties, item)) :
            reduceRefData(cache.properties, refData),
        }));
    });

  return Promise.all(promises).then((results) => (
    results.reduce((acc, item) => ({
      ...acc,
      ...item,
    }), {})
  ));
};
