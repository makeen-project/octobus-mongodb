import { has } from 'lodash';

export const hasRefCachePointers = (references) => (
  Array.isArray(references) && references.some(({ cache }) => Object.keys(cache).length)
);

const findRefData = (dispatch, refId, refEntity) => {
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

export const shouldGenerateRefCache = (data, references) => (
  references.some(({ refId, cache }) => (
    data[refId] && !has(data, cache.under)
  ))
);

export const generateRefCache = ({ dispatch, references, data }) => {
  const promises = references
    .filter(({ cache, refId }) => Object.keys(cache).length && data && data[refId])
    .map(({ refId, refEntity, cache }) => {
      const isListRef = Array.isArray(data[refId]);

      return findRefData(dispatch, data[refId], refEntity)
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

export const updateRefCache = async ({ dispatch, items, references, collection }) => {
  const refCaches = await Promise.all(
    items.map((data) => generateRefCache({ dispatch, references, data }))
  );

  const bulk = collection.initializeUnorderedBulkOp();
  items.forEach((item, index) => {
    bulk.find({ _id: item._id }).updateOne({
      $set: refCaches[index],
    });
  });

  return new Promise((resolve, reject) => {
    bulk.execute((err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

export const addReplaceListener = ({ dispatcher, references, namespace }) => {
  references.forEach((refConfig) => {
    dispatcher.onAfter(`entity.${refConfig.refEntity}.replaceOne`, ({ result }) => {
      dispatcher.dispatch(`${namespace}.updateOne`, {
        query: {
          [refConfig.refId]: result._id,
        },
        update: {
          $set: {
            [refConfig.cache.under]: refConfig.cache.properties.reduce(
              (acc, property) => ({
                ...acc,
                [property]: result[property],
              }),
              {},
            ),
          },
        },
      });
    });
  });
};
