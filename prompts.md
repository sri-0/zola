---
  Example Test Questions

  Single Tool — query_database (no approval)

  "What are our top 5 products by revenue?"

  "Show me all customers from New York."

  "How many orders were placed last month?"

  ---
  Single Tool — retrieve_documents (no approval)

  "What does our refund policy say?"

  "Find documentation about our API rate limits."

  "What are the onboarding steps for new employees?"

  ---
  Single Tool — web_search (no approval)

  "What are the latest trends in AI for 2025?"

  "Search for recent news about large language models."

  ---
  Single Tool — calculate (no approval)

  "What is 15% of $4,230?"

  "If we have 1,200 users paying $49/month, what's our monthly revenue?"

  ---
  Approval Required — write_database (triggers interrupt card)

  "Add a new product called 'Pro Plan' with a price of $99."

  "Update the status of order #1042 to 'shipped'."

  "Delete all test users from the database."

  After the interrupt card appears, try Approve, Deny, and Skip on different attempts to see all three paths.

  ---
  Multi-Tool — query_database + calculate

  "What is our total revenue from the top 3 products, and what percentage does each contribute?"

  "How many orders do we have, and what's the average order value if total revenue is $50,000?"

  ---
  Multi-Tool — web_search + retrieve_documents

  "Search for best practices for API security and compare them against our current API documentation."

  ---
  Multi-Tool — query_database + web_search

  "Show me our current customer list and search for industry benchmarks on customer retention rates."

  ---
  Multi-Tool — query_database + web_search + calculate

  "Get our total revenue from the database, search for the average SaaS revenue growth rate, and calculate what our revenue would be in 12 months at that growth rate."

  ---
  Multi-Tool with Interrupt — query_database + write_database

  "Look up all inactive users and then remove them from the database."

  This will first call query_database (no approval), then pause for approval before write_database executes. You can approve to see both tools complete, or deny to cancel the write.

  ---
  No-Tool — Direct Answer

  "What is the capital of France?"

  "Explain the difference between REST and GraphQL."

  This should answer immediately without calling any tools (no progress annotations, just streaming text).

  ---
  You can start the FastAPI server with:
  LLM_API_KEY=<your-key> LLM_BASE_URL=https://openrouter.ai/api/v1 LLM_MODEL=openai/gpt-4o-mini .venv/bin/python test_agent_server.py

  Then select Test Agent in the Zola model picker and try the questions above.