'use strict';

var TABLE_NAME = 'PersonMaster';

async function countDocuments(table) {
  try {
    var { NoSQLItem, NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
    var result = await table.queryTable({
      key_condition: {
        attribute: ['person_id'],
        operator: NoSQLEnum.NoSQLOperator.GREATER_THAN,
        value: NoSQLMarshall.makeString('')
      },
      limit: 10000
    });
    return result && result.data && result.data.length ? result.data.length : 0;
  } catch (err) {
    console.error('  Count query error: ' + err.message);
    return -1;
  }
}

async function validateWrite(documents, options) {
  var catalyst = require('zcatalyst-sdk-node');
  var app;
  if (options && options.app) {
    app = options.app;
  } else {
    app = catalyst.app();
  }

  var noSql = app.nosql();
  var table = noSql.table(TABLE_NAME);

  console.log('\nValidating write...');
  console.log('  Expected documents: ' + documents.length);

  var count = await countDocuments(table);
  console.log('  Documents in table:  ' + (count >= 0 ? count : 'unknown (query error)'));

  if (count >= 0 && count !== documents.length) {
    console.error(
      '  WARNING: Document count mismatch! Expected ' +
      documents.length + ', found ' + count
    );
    return false;
  }

  console.log('  Validation ' + (count === documents.length ? 'PASSED' : 'COMPLETED WITH WARNINGS'));
  return count === documents.length;
}

module.exports = { validateWrite, countDocuments };
