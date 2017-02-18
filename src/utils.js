import _ from 'lodash';

export const addTimestamps = (data, { createKey, updateKey }) => {
  _.set(data, updateKey, new Date());

  if (!data._id) {
    _.set(data, createKey, new Date());
  }
};

export const addTimestampToUpdate = (update, { updateKey }) => {
  let { $set } = update;
  if (!$set) {
    $set = {};
  }

  $set[updateKey] = new Date();

  return {
    ...update,
    $set,
  };
};
