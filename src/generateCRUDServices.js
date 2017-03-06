import Joi from 'joi';
import { decorators } from 'octobus.js';
import Store from './Store';

const { withSchema } = decorators;

export default (namespace, options = {}) => {
  const parsedOptions = Joi.attempt(options, {
    store: Joi.object().type(Store).required(),
    schema: Joi.object(),
  });

  const { schema, store } = parsedOptions;

  const map = {
    query: withSchema(Joi.func().required())(
      ({ message }) => message.data(store),
    ),

    findById: withSchema(Joi.any().required())(
      ({ message }) => store.findById(message.data),
    ),

    findOne: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      ({ message }) => store.findOne(message.data || {}),
    ),

    findMany: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        orderBy: Joi.any(),
        limit: Joi.number(),
        skip: Joi.number(),
        fields: Joi.any(),
      }),
    )(
      ({ message }) => store.findMany(message.data || {}),
    ),

    createOne({ send, message }) {
      return send(`${namespace}.save`, message.data);
    },

    createMany: withSchema(
      Joi.array().min(1).required(),
    )(
      ({ send, message }) => Promise.all(
        message.data.map(item => send(`${namespace}.save`, item)),
      ),
    ),

    updateOne: withSchema(
      Joi.object().keys({
        update: Joi.object().required(),
      }).unknown(true).required(),
    )(
      ({ message }) => (
        store.updateOne(message.data)
      ),
    ),

    updateMany: withSchema(
      Joi.object().keys({
        update: Joi.object().required(),
      }).unknown(true).required(),
    )(
      ({ message }) => (
        store.updateMany(message.data)
      ),
    ),

    replaceOne: withSchema(
      Joi.object().unknown(true).required(),
    )(
      ({ send, message }) => send(`${namespace}.save`, message.data),
    ),

    async save({ message, send }) {
      const data = await send(`${namespace}.validate`, message.data);
      return store.save(data);
    },

    deleteOne: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      async ({ message }) => store.deleteOne(message.data),
    ),

    deleteMany: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      async ({ message }) => store.deleteMany(message.data),
    ),

    count: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      ({ message }) => store.count(message.data),
    ),

    aggregate({ message }) {
      return store.aggregate(message.data);
    },

    validate({ message }) {
      if (!schema) {
        return message.data;
      }

      return Joi.attempt(message.data, schema, {
        convert: true,
        stripUnknown: true,
      });
    },
  };

  return map;
};
