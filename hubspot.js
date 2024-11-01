const express = require("express");
const { Client } = require("@hubspot/api-client");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

// Custom CORS middleware to allow internal network origins
function internalNetworkOrigin(origin, callback) {
  // Allow requests with no origin (like mobile apps or curl requests)
  if (!origin) return callback(null, true);

  const allowedOriginPattern = /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/;

  if (allowedOriginPattern.test(origin)) {
    // Origin is allowed
    callback(null, true);
  } else {
    // Origin is not allowed
    callback(new Error("Not allowed by CORS"));
  }
}

app.use(
  cors({
    origin: internalNetworkOrigin,
  })
);

// Initialize the HubSpot client
const hubspotClient = new Client({
  accessToken: process.env.HUBSPOT_API_TOKEN,
});

// Middleware to parse JSON
app.use(express.json());

// Define a route to fetch data from HubSpot
app.get("/hubspot-deal-get", async (req, res) => {
  try {
    let toQuoteArray = [];
    jobNumber = req.query.jobNumber;

    const limit = 100;
    const properties = [
      "hs_object_id",
      "hubspot_owner_id",
      "job_number",
      "dealname",
      "deal_currency_code",
      "amount",
    ];
    const archived = false;
    const filterGroups = [
      {
        filters: [
          {
            operator: "GTE",
            value: `${+jobNumber}`,
            propertyName: "job_number",
          },
          {
            operator: "LT",
            value: `${+jobNumber + 1}`,
            propertyName: "job_number",
          },
        ],
      },
    ];

    // Fetch a list of contacts as an example
    const dealsResponse = await hubspotClient.crm.deals.searchApi.doSearch({
      filterGroups,
      limit,
      properties,
      archived,
    });
    const deals = dealsResponse.results;
    for (let i in deals) {
      toQuoteArray[i] = {};
      toQuoteArray[i].jobNumber = deals[i].properties.job_number;
      toQuoteArray[i].dealId = deals[i].properties.hs_object_id;
      toQuoteArray[i].trescoRepId = deals[i].properties.hubspot_owner_id;
      toQuoteArray[i].currency = deals[i].properties.deal_currency_code;
      toQuoteArray[i].dealName = deals[i].properties.dealname;
      toQuoteArray[i].amount = deals[i].properties.amount;
    }

    for (let i in toQuoteArray) {
      toQuoteArray[i] = await getAssociations(toQuoteArray[i]);
    }
    res.json(toQuoteArray);
  } catch (error) {
    console.error("Error fetching HubSpot data:", error);
    res.status(500).json({ error: "Failed to fetch data from HubSpot" });
  }
});

app.get("/hubspot-deal-amount", async (req, res) => {
  try {
    // Fetch a list of contacts as an example
    recordToUpdate = req.query.dealObjNum;
    amount = req.query.amount;
    amount = Math.round(+amount * 100) / 100;

    const apiResponse = await hubspotClient.crm.deals.basicApi.update(
      recordToUpdate,
      { properties: { amount } }
    );

    res.status(200).json({ success: true, data: apiResponse });
  } catch (error) {
    console.error("Error fetching HubSpot data:", error);
    res.status(500).json({ error: "Failed to fetch data from HubSpot" });
  }
});
// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

async function getAssociations(quoteRequest) {
  let contactIdArray = await hubspotClient.crm.associations.v4.basicApi.getPage(
    "deals",
    quoteRequest.dealId,
    "contacts"
  );

  let companyIdArray = await hubspotClient.crm.associations.v4.basicApi.getPage(
    "deals",
    quoteRequest.dealId,
    "companies"
  );

  for (let i in contactIdArray.results) {
    let associationFound = false;
    for (let j in contactIdArray.results[i].associationTypes) {
      if (contactIdArray.results[i].associationTypes[j].typeId == 1) {
        quoteRequest.contactId = contactIdArray.results[i].toObjectId;
        associationFound = true;
        break;
      } else {
        quoteRequest.contactId = contactIdArray.results[0].toObjectId;
      }
    }
    if (associationFound) {
      break;
    }
  }

  for (let i in companyIdArray.results) {
    let associationFound = false;
    for (let j in companyIdArray.results[i].associationTypes) {
      if (companyIdArray.results[i].associationTypes[j].typeId == 5) {
        quoteRequest.companyId = companyIdArray.results[i].toObjectId;
        associationFound = true;
        break;
      } else {
        quoteRequest.companyId = companyIdArray.results[0].toObjectId;
      }
    }
    if (associationFound) {
      break;
    }
  }

  if (quoteRequest.contactId == undefined) {
    quoteRequest.contact = "";
  } else {
    quoteRequest.contact = await hubspotClient.crm.contacts.basicApi.getById(
      quoteRequest.contactId
    );
    quoteRequest.contact = `${quoteRequest.contact.properties.firstname} ${quoteRequest.contact.properties.lastname}`;
  }
  if (quoteRequest.companyId == undefined) {
    quoteRequest.company = "";
  } else {
    quoteRequest.company = await hubspotClient.crm.companies.basicApi.getById(
      quoteRequest.companyId
    );
    quoteRequest.company = quoteRequest.company.properties.name;
  }

  quoteRequest.trescoRep = await hubspotClient.crm.objects.searchApi.doSearch(
    "users",
    {
      filterGroups: [
        {
          filters: [
            {
              operator: "EQ",
              value: quoteRequest.trescoRepId,
              propertyName: "hubspot_owner_id",
            },
          ],
        },
      ],
      limit: 100,
      properties: [
        "hs_main_phone",
        "hs_additional_phone",
        "hs_family_name",
        "hs_given_name",
        "hs_email",
        "hubspot_owner_id",
      ],
      archived: false,
    }
  );
  quoteRequest.trescoRep = quoteRequest.trescoRep.results[0].properties;
  quoteRequest.trescoRepPhone = quoteRequest.trescoRep.hs_main_phone || "";
  quoteRequest.trescoRepName = `${quoteRequest.trescoRep.hs_given_name || ""} ${
    quoteRequest.trescoRep.hs_family_name || ""
  }`;
  quoteRequest.trescoRepEmail = quoteRequest.trescoRep.hs_email || "";

  return quoteRequest;
}
