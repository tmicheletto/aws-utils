const argv = require('yargs').argv
const AWS = require('aws-sdk');

AWS.config.region = 'ap-southeast-2'; //update for your region

const dynamoDb = new AWS.DynamoDB();

const truncateTable = async(tableName, lastEvaluatedKey) => {

    const primaryKeys = [];

    const result = await dynamoDb.describeTable({TableName: tableName}).promise();

    result.Table.KeySchema.forEach(element => primaryKeys.push(element.AttributeName))

    const scanResult = await dynamoDb.scan({TableName: tableName, ExclusiveStartKey: lastEvaluatedKey, AttributesToGet: primaryKeys}).promise();
    lastEvaluatedKey = scanResult.LastEvaluatedKey;

    await Promise.all(scanResult.Items.map((item) => dynamoDb.deleteItem({TableName: tableName, Key: item}).promise()));

    if (lastEvaluatedKey) {
        return await truncateTable(tableName, lastEvaluatedKey);
    }
    return "Done!";
}

truncateTable(argv.tableName)
  .then(console.log)
  .catch((error) => {
      console.error(error);
  });
