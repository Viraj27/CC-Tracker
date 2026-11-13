# Third-party data in this catalog

## credit-card-bonuses-api

Card files in `catalog/cards/` marked `depth: stub`, and every `public_offer` block whose
`source_url` is `https://github.com/andenacitelli/credit-card-bonuses-api`, are derived from
[andenacitelli/credit-card-bonuses-api](https://github.com/andenacitelli/credit-card-bonuses-api)
(`exports/data.json`, `master` branch). They are written by `npm run catalog:import`
(`scripts/catalog-import.ts`). Fields taken: name, issuer, network, business flag, annual fee,
first-year waiver, product URL and the current welcome offer.

The data is used here for personal, non-commercial purposes under its licence, reproduced below
as required.

```
MIT License

Copyright (c) 2023 Anden Acitelli

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

“Commons Clause” License Condition v1.0

The Software is provided to you by the Licensor under the License, as defined below, subject to the following condition.

Without limiting other conditions in the License, the grant of rights under the License will not include, and the License does not grant to you, the right to Sell the Software.

For purposes of the foregoing, “Sell” means practicing any or all of the rights granted to you under the License to provide to third parties, for a fee or other consideration (including without limitation fees for hosting or consulting/ support services related to the Software), a product or service whose value derives, entirely or substantially, from the functionality of the Software. Any license notice or attribution required by the License must also include this Commons Clause License Condition notice.

Software: credit-card-bonuses-api

License: MIT License

Licensor: Anden Acitelli
```
