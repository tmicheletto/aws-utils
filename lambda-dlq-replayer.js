'use strict';

const AWS = require('aws-sdk'); // eslint-disable-line
const Logger = require('../services/logger-service');

const sqs = new AWS.SQS();
const lambda = new AWS.Lambda();

const queueUrl = process.env.FILTER_DEAD_LETTER_QUEUE_URL;

const getMessages = () => {
  const params = {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 1
  };

  return sqs.receiveMessage(params).promise()
    .then((data) => {
      const messages = data && data.Messages ? data.Messages : [];
      return messages;
    });
};

const invokeLambda = (messages) => {
  const invocations = [];
  messages.forEach((message) => {
    const snsMessage = JSON.parse(message.Body);
    const params = {
      FunctionName: process.env.FILTER_LAMBDA_FUNCTION_NAME,
      InvocationType: 'Event',
      Payload: JSON.stringify(snsMessage)
    };
    invocations.push(lambda.invoke(params).promise());
  });
  return Promise.all(invocations);
};

const deleteMessages = (messages) => {
  const invocations = [];
  messages.forEach((message) => {
    const params = {
      QueueUrl: queueUrl,
      ReceiptHandle: message.ReceiptHandle
    };
    invocations.push(sqs.deleteMessage(params).promise());
  });
  return Promise.all(invocations);
};

const replayMessages = () => {
  return getMessages()
    .then((messages) => {
      return invokeLambda(messages)
        .then(() => {
          Logger.info('Invoked lambda');
          return messages;
        });
    })
    .then((messages) => {
      return deleteMessages(messages)
        .then(() => {
          Logger.info('Deleted messages from queue');
          return messages;
        });
    })
    .then((messages) => {
      if (messages.length > 0) {
        Logger.info('Still more messages. Keep processing.');
        return replayMessages();
      }
      Logger.info('No more messages.');
      return Promise.resolve();
    });
};

module.exports.handler = (event, context, callback) => {
  replayMessages()
    .then(() => { // eslint-disable-line
      callback(null, 'Filter DLQ re-processor completed successfully');
    })
    .catch((error) => {
      const message = `Filter DLQ re-processor failed with error: ${error}`;
      Logger.error(message);
      callback(message);
    });
};
